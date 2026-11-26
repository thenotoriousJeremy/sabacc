/**
 * In-browser loopback game transport running `lib/room-engine.ts` directly on the client.
 * Enables 100% standalone offline mobile play (Android APK, installed iOS/Android PWA,
 * or offline browser) for Quick Solo, Outer Rim Cantina Tour, and Daily Kessel Run.
 */

import {
  BotSkill,
  GameMode,
  GameState,
  Player,
  STAKES_PRESETS,
  StakesTier,
  TieRule,
} from './game-logic';
import { QUICK_EMOTES } from './personas';
import { Rng } from './prng';
import {
  addBotToGame,
  advanceCantinaTourStage,
  applyBetAction,
  applyCardAction,
  canStartHand,
  createRoomState,
  dealNewHand,
  executeSabaccShift,
  finishDicePhase,
  performBotTurn,
  populateSoloBots,
  sanitizeStateFor,
  syncLedgerPlayer,
  totalAnte,
} from './room-engine';

type Listener = (...args: any[]) => void;

export class LocalGameTransport {
  private listeners = new Map<string, Set<Listener>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private game: GameState;
  private rng: Rng;
  private playerId = 'local-pilot';
  public connected = true;

  constructor(opts: { mode: GameMode; stakesTier?: StakesTier; dailyDateKey?: string }) {
    const created = createRoomState({
      roomId: 'LOCAL',
      mode: opts.mode,
      stakesTier: opts.stakesTier,
      dailyDateKey: opts.dailyDateKey,
    });
    this.game = created.game;
    this.rng = created.rng;

    setTimeout(() => {
      if (!this.connected) return;
      this.trigger('connect');
    }, 10);
  }

  on(event: string, fn: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(event, set);
    return this;
  }

  disconnect(): void {
    this.connected = false;
    for (const handle of this.timers.values()) clearTimeout(handle);
    this.timers.clear();
    this.listeners.clear();
  }

  private trigger(event: string, ...args: any[]): void {
    if (!this.connected) return;
    for (const fn of this.listeners.get(event) ?? []) {
      fn(...args);
    }
  }

  private schedule(slot: string, fn: () => void, ms: number): void {
    const prev = this.timers.get(slot);
    if (prev) clearTimeout(prev);
    this.timers.set(
      slot,
      setTimeout(() => {
        this.timers.delete(slot);
        if (!this.connected) return;
        fn();
      }, ms)
    );
  }

  private clearFlowTimers(): void {
    for (const slot of ['ai', 'dice', 'shift']) {
      const h = this.timers.get(slot);
      if (h) {
        clearTimeout(h);
        this.timers.delete(slot);
      }
    }
  }

  private broadcast(): void {
    this.trigger('gameStateUpdate', sanitizeStateFor(this.game, this.playerId));
  }

  private onPhaseCheck(prev: GameState['currentPhase'], next: GameState['currentPhase']): void {
    if (next === 'DICE' && prev !== 'DICE') {
      this.clearFlowTimers();
      this.schedule(
        'dice',
        () => {
          if (this.game.currentPhase !== 'DICE') return;
          if (this.game.shiftPending) {
            executeSabaccShift(this.game, this.rng);
            this.broadcast();
            this.schedule(
              'shift',
              () => {
                const after = finishDicePhase(this.game, this.rng);
                this.onPhaseCheck('DICE', after);
                this.broadcast();
              },
              1650
            );
          } else {
            this.schedule(
              'shift',
              () => {
                const after = finishDicePhase(this.game, this.rng);
                this.onPhaseCheck('DICE', after);
                this.broadcast();
              },
              850
            );
          }
        },
        1350
      );
      return;
    }

    if (next === 'SHOWDOWN') {
      this.clearFlowTimers();
      return;
    }

    if (this.game.currentPhase === 'CARD' || this.game.currentPhase === 'BETTING') {
      const active = this.game.players[this.game.turnIndex];
      if (active?.isAI && !active.isFolded) {
        const jitter = this.game.mode === 'daily_kessel' ? 0 : Math.floor(Math.random() * 220);
        this.schedule(
          'ai',
          () => {
            const p = this.game.currentPhase;
            const n = performBotTurn(this.game, this.rng);
            this.onPhaseCheck(p, n);
            this.broadcast();
          },
          680 + jitter
        );
      }
    }
  }

  emit(event: string, payload: any = {}): void {
    if (!this.connected) return;

    switch (event) {
      case 'joinRoom': {
        if (this.game.players.length === 0) {
          const minStack = totalAnte(this.game.settings) * 4;
          const requestedVault = Number(payload?.vaultCredits);
          const credits =
            this.game.mode === 'quick_solo' && Number.isFinite(requestedVault) && requestedVault > 0
              ? Math.max(minStack, Math.min(250_000, Math.floor(requestedVault)))
              : this.game.settings.startingCredits;
          const human: Player = {
            id: this.playerId,
            name: String(payload?.playerName || 'Pilot').slice(0, 20),
            hand: [],
            credits,
            buyInTotal: credits,
            contributed: 0,
            isFolded: false,
            isReady: true,
            betThisRound: 0,
            isSpectator: false,
            isConnected: true,
            lastAction: null,
          };
          this.game.players.push(human);
          this.game.hostId = human.id;
          syncLedgerPlayer(this.game, human);
          populateSoloBots(this.game, this.rng);
        }
        this.trigger('session', {
          token: 'local-token',
          playerId: this.playerId,
          roomId: 'LOCAL',
        });
        if (canStartHand(this.game)) {
          const phase = dealNewHand(this.game, this.rng);
          this.onPhaseCheck('JOINING', phase);
        }
        this.broadcast();
        break;
      }

      case 'ready':
      case 'startHandNow': {
        const me = this.game.players.find(p => p.id === this.playerId);
        if (!me) return;
        const req = totalAnte(this.game.settings);
        if (me.credits < req) {
          this.trigger('error', `Need at least ${req} CR to ante.`);
          return;
        }
        me.isReady = true;
        if (canStartHand(this.game)) {
          const phase = dealNewHand(this.game, this.rng);
          this.onPhaseCheck('SHOWDOWN', phase);
        }
        this.broadcast();
        break;
      }

      case 'cardAction': {
        const prev = this.game.currentPhase;
        const res = applyCardAction(
          this.game,
          this.playerId,
          payload.action,
          payload.cardId,
          this.rng
        );
        if (!res.ok) {
          if (res.error) this.trigger('error', res.error);
          return;
        }
        this.onPhaseCheck(prev, res.nextPhase);
        this.broadcast();
        break;
      }

      case 'betAction': {
        const prev = this.game.currentPhase;
        const res = applyBetAction(
          this.game,
          this.playerId,
          payload.action,
          payload.amount !== undefined ? Number(payload.amount) : undefined,
          this.rng
        );
        if (!res.ok) {
          if (res.error) this.trigger('error', res.error);
          return;
        }
        this.onPhaseCheck(prev, res.nextPhase);
        this.broadcast();
        break;
      }

      case 'advanceTourStage': {
        if (advanceCantinaTourStage(this.game, this.rng)) {
          const phase = dealNewHand(this.game, this.rng);
          this.onPhaseCheck('JOINING', phase);
          this.broadcast();
        }
        break;
      }

      case 'addCredits': {
        if (this.game.settings.lockedCredits) {
          this.trigger('error', 'Re-buys are locked in this mode.');
          return;
        }
        const me = this.game.players.find(p => p.id === this.playerId);
        const amt = Math.max(1, Math.min(100_000, Math.floor(Number(payload.amount) || 0)));
        if (me && amt > 0) {
          me.credits += amt;
          me.buyInTotal += amt;
          syncLedgerPlayer(this.game, me);
          this.broadcast();
        }
        break;
      }

      case 'addAI': {
        if (this.game.mode !== 'quick_solo') return;
        const skill = payload?.skill as BotSkill | undefined;
        addBotToGame(this.game, { skill }, this.rng);
        this.broadcast();
        break;
      }

      case 'removeAI': {
        if (this.game.mode !== 'quick_solo') return;
        const idx = this.game.players.findIndex(p => p.id === payload?.aiId && p.isAI);
        if (idx !== -1) {
          this.game.players.splice(idx, 1);
          this.broadcast();
        }
        break;
      }

      case 'updateTableSettings': {
        if (this.game.mode !== 'quick_solo') return;
        if (payload?.stakesTier && payload.stakesTier in STAKES_PRESETS) {
          const tier = payload.stakesTier as StakesTier;
          const preset = STAKES_PRESETS[tier];
          this.game.settings.stakesTier = tier;
          this.game.settings.ante = preset.ante;
          this.game.settings.sabaccAnte = preset.sabaccAnte;
          this.game.settings.tableLimit = preset.tableLimit;
        }
        if (payload?.tieRule === 'split' || payload?.tieRule === 'blind_draw') {
          this.game.settings.tieRule = payload.tieRule as TieRule;
        }
        if (typeof payload?.lockedCredits === 'boolean') {
          this.game.settings.lockedCredits = payload.lockedCredits;
        }
        this.broadcast();
        break;
      }

      case 'emote': {
        const clean = String(payload?.text ?? '').trim();
        const me = this.game.players.find(p => p.id === this.playerId);
        if (me && (QUICK_EMOTES as readonly string[]).includes(clean)) {
          me.lastAction = { text: clean, tone: 'emote', timestamp: Date.now() };
          this.broadcast();
        }
        break;
      }
    }
  }
}
