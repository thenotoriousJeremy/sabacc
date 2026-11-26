import { decideBet, decideCard, profileFor } from './bots';

const makeUuid = (): string =>
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
import { getCantinaStage } from './cantina-tour';
import {
  createDailyRng,
  DAILY_KESSEL_BOT_IDS,
  DAILY_KESSEL_BOT_STACK,
  DAILY_KESSEL_MAX_HANDS,
  DAILY_KESSEL_SETTINGS,
  normalizeDailyKey,
} from './daily-seed';
import {
  BotSkill,
  CardSuit,
  CardType,
  ClientGameState,
  createDeck,
  defaultTableSettings,
  drawFromShoe,
  effectiveTableLimit,
  evaluateHand,
  GameMode,
  GameState,
  Player,
  shuffle,
  spendableFor,
  StakesTier,
  TableSettings,
} from './game-logic';
import { getPersonaById, maybePickQuip, pickPersona } from './personas';
import { resolveShowdown } from './pots';
import { Rng } from './prng';

const MAX_LOGS = 45;

export interface CreateRoomOptions {
  roomId: string;
  mode?: GameMode;
  stakesTier?: StakesTier;
  dailyDateKey?: string;
}

export function createRoomState(opts: CreateRoomOptions): { game: GameState; rng: Rng } {
  const mode: GameMode = opts.mode ?? 'party';
  let settings: TableSettings = defaultTableSettings(opts.stakesTier ?? 'medium');
  let rng: Rng = Math.random;
  let tour: GameState['tour'] = null;
  let daily: GameState['daily'] = null;

  if (mode === 'quick_solo') {
    settings = {
      ...defaultTableSettings(opts.stakesTier ?? 'medium'),
      turnSeconds: 0,
    };
  } else if (mode === 'cantina_tour') {
    const stage = getCantinaStage(0);
    settings = { ...stage.settings };
    tour = {
      stageIndex: 0,
      venueName: stage.venueName,
      venueSubtitle: stage.venueSubtitle,
      targetCredits: stage.targetCredits,
      stageCleared: false,
      tourCompleted: false,
      runFailed: false,
    };
  } else if (mode === 'daily_kessel') {
    const dateKey = normalizeDailyKey(opts.dailyDateKey);
    rng = createDailyRng(dateKey);
    settings = { ...DAILY_KESSEL_SETTINGS };
    daily = {
      dateKey,
      maxHands: DAILY_KESSEL_MAX_HANDS,
      handsCompleted: 0,
      history: [],
      finished: false,
      startingCredits: DAILY_KESSEL_SETTINGS.startingCredits,
    };
  }

  const game: GameState = {
    roomId: opts.roomId,
    hostId: null,
    mode,
    settings,
    players: [],
    deck: shuffle(createDeck(), rng),
    discardPile: [],
    handPot: 0,
    sabaccPot: 0,
    currentRound: 1,
    gamesPlayed: 0,
    currentPhase: 'JOINING',
    turnIndex: 0,
    dealerIndex: -1,
    currentBet: 0,
    minRaise: settings.ante,
    bettingLapComplete: false,
    turnExpires: null,
    lastDiceRoll: null,
    shiftPending: false,
    shiftTriggered: false,
    winnerId: null,
    winnerIds: [],
    showdownResult: null,
    ledger: {},
    tour,
    daily,
    logs: [
      mode === 'cantina_tour'
        ? `Entered ${tour!.venueName} (${tour!.venueSubtitle}). Target stack: ${tour!.targetCredits} CR.`
        : mode === 'daily_kessel'
          ? `Daily Kessel Run (${daily!.dateKey}): 5 hands to maximize 250 CR.`
          : `Sector ${opts.roomId} initialized.`,
    ],
    messages: [],
  };

  return { game, rng };
}

export function trimLogs(game: GameState): void {
  if (game.logs.length > MAX_LOGS) {
    game.logs = game.logs.slice(-MAX_LOGS);
  }
}

export function syncLedgerPlayer(game: GameState, player: Player): void {
  if (player.isSpectator && !game.ledger[player.id]) return;
  const existing = game.ledger[player.id] ?? {
    playerId: player.id,
    name: player.name,
    isAI: !!player.isAI,
    buyInTotal: player.buyInTotal,
    credits: player.credits,
    net: 0,
    handsPlayed: 0,
    handsWon: 0,
    biggestPot: 0,
  };
  existing.name = player.name;
  existing.buyInTotal = player.buyInTotal;
  existing.credits = player.credits;
  existing.net = player.credits - player.buyInTotal;
  game.ledger[player.id] = existing;
}

export function syncAllLedger(game: GameState): void {
  for (const p of game.players) syncLedgerPlayer(game, p);
}

/**
 * Redacts `GameState` for a specific viewer:
 * - Removes `deck` completely and sends `deckCount` instead.
 * - Masks opponent hole cards (and replaces card IDs so `c-60` never leaks a Sylop)
 *   until `SHOWDOWN` for unfolded contenders.
 */
export function sanitizeStateFor(game: GameState, viewerPlayerId: string | null): ClientGameState {
  const revealAllUnfolded = game.currentPhase === 'SHOWDOWN';
  const { deck, ...rest } = game;

  const players: Player[] = game.players.map(p => {
    const canSeeHand =
      p.id === viewerPlayerId || (revealAllUnfolded && !p.isFolded && !p.isSpectator);

    const { pilotKey: _stripKey, ...safePlayer } = p;
    void _stripKey;
    return {
      ...safePlayer,
      hand: canSeeHand
        ? p.hand.map(c => ({ ...c }))
        : p.hand.map((_, idx) => ({
            id: `${p.id}-slot-${idx}`,
            value: 0,
            type: CardType.POSITIVE,
            suit: CardSuit.NONE,
            hidden: true,
          })),
    };
  });

  return {
    ...rest,
    players,
    deckCount: deck.length,
  };
}

export function addBotToGame(
  game: GameState,
  opts: { personaId?: string; skill?: BotSkill; credits?: number } = {},
  rng: Rng = Math.random
): Player | null {
  if (game.players.length >= 6) return null;
  const taken = new Set(game.players.map(p => p.name));
  const explicit = opts.personaId ? getPersonaById(opts.personaId) : undefined;
  const persona = explicit ?? pickPersona(taken, opts.skill, rng);
  const credits = opts.credits ?? game.settings.startingCredits;
  const uniqueName = taken.has(persona.name) ? `${persona.name}-${game.players.length + 1}` : persona.name;

  const bot: Player = {
    id: `ai-${makeUuid()}`,
    name: uniqueName,
    hand: [],
    credits,
    buyInTotal: credits,
    contributed: 0,
    isFolded: false,
    isReady: true,
    betThisRound: 0,
    isAI: true,
    botSkill: persona.skill,
    personaId: persona.id,
    avatarTone: persona.avatarTone,
    tagline: persona.tagline,
    isConnected: true,
    lastAction: null,
  };
  game.players.push(bot);
  syncLedgerPlayer(game, bot);
  game.logs.push(`${bot.name} (${persona.tagline}) took a seat.`);
  trimLogs(game);
  return bot;
}

export function populateSoloBots(game: GameState, rng: Rng = Math.random): void {
  if (game.players.some(p => p.isAI)) return;
  if (game.mode === 'quick_solo') {
    const tierSkills: Record<StakesTier, BotSkill[]> = {
      low: ['novice', 'novice', 'regular'],
      medium: ['novice', 'regular', 'shark'],
      high: ['regular', 'shark', 'shark'],
      no_limit: ['regular', 'shark', 'shark'],
    };
    for (const skill of tierSkills[game.settings.stakesTier]) {
      addBotToGame(game, { skill, credits: game.settings.startingCredits }, rng);
    }
  } else if (game.mode === 'cantina_tour') {
    const stage = getCantinaStage(game.tour?.stageIndex ?? 0);
    for (const personaId of stage.rosterPersonaIds) {
      addBotToGame(game, { personaId, credits: stage.botStack }, rng);
    }
  } else if (game.mode === 'daily_kessel') {
    for (const personaId of DAILY_KESSEL_BOT_IDS) {
      addBotToGame(game, { personaId, credits: DAILY_KESSEL_BOT_STACK }, rng);
    }
  }
}

export function isPresent(player: Player): boolean {
  return player.isAI === true || player.isConnected !== false;
}

export function totalAnte(settings: TableSettings): number {
  return settings.ante + settings.sabaccAnte;
}

export function canStartHand(game: GameState): boolean {
  if (game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN') return false;
  if (game.daily?.finished || game.tour?.runFailed || game.tour?.tourCompleted) return false;
  const present = game.players.filter(isPresent);
  const contenders = present.filter(p => !p.isSpectator && p.credits >= totalAnte(game.settings));
  const humans = present.filter(p => !p.isAI && !p.isSpectator);
  return contenders.length >= 2 && humans.length >= 1 && humans.every(p => p.isReady);
}

export function nextEligibleIndex(game: GameState, from: number, requireSpendable = false): number {
  const n = game.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = game.players[idx];
    if (p.isFolded || p.isSpectator) continue;
    if (requireSpendable && spendableFor(p, game.settings) <= 0) continue;
    return idx;
  }
  return from;
}

/** Deals a new hand. Returns `'SHOWDOWN'` if fewer than 2 players could ante, else `'CARD'`. */
export function dealNewHand(game: GameState, rng: Rng = Math.random): 'CARD' | 'SHOWDOWN' {
  const ante = game.settings.ante;
  const sabaccAnte = game.settings.sabaccAnte;
  const reqAnte = ante + sabaccAnte;

  // In solo modes, keep bots solvent so the human is never stuck at a dead table.
  if (game.mode === 'cantina_tour' || game.mode === 'quick_solo' || game.mode === 'daily_kessel') {
    const refillStack =
      game.mode === 'cantina_tour'
        ? getCantinaStage(game.tour?.stageIndex ?? 0).botStack
        : game.mode === 'daily_kessel'
          ? DAILY_KESSEL_BOT_STACK
          : game.settings.startingCredits;
    for (const p of game.players) {
      if (p.isAI && p.credits < reqAnte * 2) {
        const added = refillStack - p.credits;
        p.credits = refillStack;
        p.buyInTotal += added;
        game.logs.push(`House backed ${p.name} with +${added} CR.`);
      }
    }
  }

  game.currentPhase = 'CARD';
  game.currentRound = 1;
  game.deck = shuffle(createDeck(), rng);
  game.discardPile = [game.deck.pop()!];
  game.handPot = 0;
  game.winnerId = null;
  game.winnerIds = [];
  game.showdownResult = null;
  game.currentBet = 0;
  game.minRaise = ante;
  game.bettingLapComplete = false;
  game.lastDiceRoll = null;
  game.shiftPending = false;
  game.shiftTriggered = false;

  game.dealerIndex = (game.dealerIndex + 1 + game.players.length) % game.players.length;
  game.logs.push(`Hand #${game.gamesPlayed + 1} — ${game.players[game.dealerIndex].name} deals.`);

  for (const p of game.players) {
    p.handStartCredits = p.credits;
    p.contributed = 0;
    p.betThisRound = 0;
    p.lastAction = null;

    if (p.isSpectator || (!p.isAI && p.isConnected === false)) {
      p.isFolded = true;
      p.hand = [];
      continue;
    }

    if (p.credits < reqAnte) {
      p.isFolded = true;
      p.hand = [];
      game.logs.push(`${p.name} cannot cover the ${reqAnte} CR ante and sits out.`);
      continue;
    }

    p.credits -= reqAnte;
    p.contributed = ante;
    game.handPot += ante;
    game.sabaccPot += sabaccAnte;
    p.hand = [drawFromShoe(game, rng), drawFromShoe(game, rng)];
    p.isFolded = false;
  }

  game.logs.push(`Active seats paid ${ante} CR Hand + ${sabaccAnte} CR Sabacc ante.`);
  syncAllLedger(game);
  trimLogs(game);

  const active = game.players.filter(p => !p.isFolded && !p.isSpectator);
  if (active.length < 2) {
    executeShowdown(game, rng);
    return 'SHOWDOWN';
  }

  game.turnIndex = nextEligibleIndex(game, game.dealerIndex, false);
  return 'CARD';
}

export function contributeToPot(game: GameState, player: Player, amount: number): number {
  const paid = Math.min(Math.max(0, amount), spendableFor(player, game.settings));
  player.credits -= paid;
  player.betThisRound += paid;
  player.contributed += paid;
  game.handPot += paid;
  return paid;
}

export function applyCardAction(
  game: GameState,
  playerId: string,
  action: 'draw' | 'swap_deck' | 'swap_discard' | 'stand',
  cardId?: string,
  rng: Rng = Math.random
): { ok: boolean; error?: string; nextPhase: GameState['currentPhase'] } {
  if (game.currentPhase !== 'CARD') return { ok: false, error: 'Not in Card Phase.', nextPhase: game.currentPhase };
  const current = game.players[game.turnIndex];
  if (!current || current.id !== playerId) return { ok: false, error: 'Not your turn.', nextPhase: game.currentPhase };

  const now = Date.now();
  if (action === 'draw') {
    if (current.hand.length >= 6) {
      return { ok: false, error: 'Hand is at maximum capacity (6 cards).', nextPhase: game.currentPhase };
    }
    current.hand.push(drawFromShoe(game, rng));
    current.lastAction = { text: 'Drew Deck', tone: 'card', timestamp: now };
    game.logs.push(`${current.name} drew from the shoe.`);
  } else if (action === 'swap_deck') {
    const idx = current.hand.findIndex(c => c.id === cardId);
    if (idx === -1) return { ok: false, error: 'Select a card in hand to swap.', nextPhase: game.currentPhase };
    const [discarded] = current.hand.splice(idx, 1);
    game.discardPile.push(discarded);
    current.hand.push(drawFromShoe(game, rng));
    current.lastAction = {
      text: `Swapped (${discarded.value > 0 ? `+${discarded.value}` : discarded.value})`,
      tone: 'card',
      timestamp: now,
    };
    game.logs.push(`${current.name} swapped with the shoe.`);
  } else if (action === 'swap_discard') {
    const idx = current.hand.findIndex(c => c.id === cardId);
    if (idx === -1 || game.discardPile.length === 0) {
      return { ok: false, error: 'Select a card to swap with the discard.', nextPhase: game.currentPhase };
    }
    const [discarded] = current.hand.splice(idx, 1);
    const taken = game.discardPile.pop()!;
    game.discardPile.push(discarded);
    current.hand.push(taken);
    const takenStr = taken.value > 0 ? `+${taken.value}` : `${taken.value}`;
    current.lastAction = { text: `Took ${takenStr}`, tone: 'card', timestamp: now };
    game.logs.push(`${current.name} took ${takenStr} from discard.`);
  } else {
    current.lastAction = { text: 'Stood', tone: 'neutral', timestamp: now };
    game.logs.push(`${current.name} stood.`);
  }

  const nextPhase = stepTurn(game, rng);
  trimLogs(game);
  return { ok: true, nextPhase };
}

export function applyBetAction(
  game: GameState,
  playerId: string,
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in',
  rawAmount?: number,
  rng: Rng = Math.random
): { ok: boolean; error?: string; nextPhase: GameState['currentPhase'] } {
  if (game.currentPhase !== 'BETTING') {
    return { ok: false, error: 'Not in Betting Phase.', nextPhase: game.currentPhase };
  }
  const current = game.players[game.turnIndex];
  if (!current || current.id !== playerId) {
    return { ok: false, error: 'Not your turn.', nextPhase: game.currentPhase };
  }

  const now = Date.now();
  const amount = Math.max(0, Math.floor(Number(rawAmount) || 0));
  const spendable = spendableFor(current, game.settings);

  if (action === 'fold') {
    current.isFolded = true;
    const quip = current.isAI ? maybePickQuip(current.personaId, 'fold', 0.35, rng) : null;
    current.lastAction = quip
      ? { text: quip, tone: 'quips', timestamp: now }
      : { text: 'Folded', tone: 'fold', timestamp: now };
    game.logs.push(`${current.name} folded.`);
  } else if (action === 'check') {
    if (game.currentBet > current.betThisRound && spendable > 0) {
      return { ok: false, error: 'Cannot check facing a bet — call, raise, or fold.', nextPhase: game.currentPhase };
    }
    current.lastAction = { text: 'Check', tone: 'neutral', timestamp: now };
    game.logs.push(`${current.name} checked.`);
  } else if (action === 'call') {
    const due = game.currentBet - current.betThisRound;
    const paid = contributeToPot(game, current, due);
    if (paid > 0) {
      const capped = spendableFor(current, game.settings) === 0;
      current.lastAction = {
        text: capped ? `Call (${paid} • Cap)` : `Call ${paid}`,
        tone: capped ? 'all_in' : 'bet',
        timestamp: now,
      };
      game.logs.push(`${current.name} called ${paid} CR${capped ? ' (at cap/all-in)' : ''}.`);
    } else {
      current.lastAction = { text: 'Check', tone: 'neutral', timestamp: now };
      game.logs.push(`${current.name} checked.`);
    }
  } else if (action === 'bet' || action === 'raise' || action === 'all_in') {
    const isAllIn = action === 'all_in';
    const raiseTo = isAllIn ? current.betThisRound + spendable : game.currentBet + amount;
    const totalToPay = raiseTo - current.betThisRound;

    if (totalToPay <= 0) {
      return { ok: false, error: `Minimum raise is ${game.minRaise} CR.`, nextPhase: game.currentPhase };
    }
    if (totalToPay > current.credits) {
      return { ok: false, error: 'Not enough credits.', nextPhase: game.currentPhase };
    }
    if (totalToPay > spendable) {
      const lim = effectiveTableLimit(game.settings);
      return { ok: false, error: `Exceeds the ${lim} CR hand limit.`, nextPhase: game.currentPhase };
    }

    const increment = raiseTo - game.currentBet;
    const isShortCap = totalToPay === spendable;
    if (increment < game.minRaise && !isShortCap) {
      return { ok: false, error: `Minimum raise is ${game.minRaise} CR.`, nextPhase: game.currentPhase };
    }

    contributeToPot(game, current, totalToPay);
    if (raiseTo > game.currentBet) {
      if (increment >= game.minRaise) game.minRaise = increment;
      game.currentBet = raiseTo;
    }

    const hitCap = spendableFor(current, game.settings) === 0;
    const quip = current.isAI ? maybePickQuip(current.personaId, 'raise', 0.35, rng) : null;
    if (quip) {
      current.lastAction = { text: quip, tone: 'quips', timestamp: now };
    } else if (hitCap) {
      const label = current.credits === 0 ? `ALL IN ${totalToPay}` : `MAX BET ${raiseTo}`;
      current.lastAction = { text: label, tone: 'all_in', timestamp: now };
    } else {
      current.lastAction = { text: `${game.currentBet === totalToPay ? 'Bet' : 'Raise'} ${raiseTo}`, tone: 'raise', timestamp: now };
    }

    game.logs.push(
      hitCap
        ? `${current.name} committed ${totalToPay} CR (${current.credits === 0 ? 'ALL IN' : 'TABLE MAX'}).`
        : `${current.name} ${action === 'bet' ? 'bet' : 'raised to'} ${raiseTo} CR.`
    );
  }

  syncLedgerPlayer(game, current);
  const nextPhase = stepTurn(game, rng);
  trimLogs(game);
  return { ok: true, nextPhase };
}

/** Advances turn/phase after a card or bet move. When entering DICE, rolls Spike Dice. */
export function stepTurn(game: GameState, rng: Rng = Math.random): GameState['currentPhase'] {
  const active = game.players.filter(p => !p.isFolded && !p.isSpectator);
  if (active.length <= 1) {
    game.logs.push('All opponents folded.');
    executeShowdown(game, rng);
    return 'SHOWDOWN';
  }

  if (game.currentPhase === 'BETTING' && active.every(p => spendableFor(p, game.settings) === 0)) {
    beginDicePhase(game, rng);
    return 'DICE';
  }

  let nextIndex = game.turnIndex;
  let passedDealer = false;
  let attempts = 0;

  do {
    if (nextIndex === game.dealerIndex) passedDealer = true;
    nextIndex = (nextIndex + 1) % game.players.length;
    attempts++;
  } while (
    (game.players[nextIndex].isFolded ||
      game.players[nextIndex].isSpectator ||
      (game.currentPhase === 'BETTING' && spendableFor(game.players[nextIndex], game.settings) === 0)) &&
    attempts < game.players.length
  );

  game.turnIndex = nextIndex;

  if (passedDealer) {
    if (game.currentPhase === 'CARD') {
      game.currentPhase = 'BETTING';
      game.currentBet = 0;
      game.minRaise = game.settings.ante;
      game.bettingLapComplete = false;
      for (const p of game.players) p.betThisRound = 0;
      game.logs.push(`Round ${game.currentRound} Betting Phase.`);
      // Ensure turnIndex lands on someone who can actually bet if dealer neighbor was capped:
      if (spendableFor(game.players[game.turnIndex], game.settings) === 0) {
        game.turnIndex = nextEligibleIndex(game, game.dealerIndex, true);
      }
    } else if (game.currentPhase === 'BETTING') {
      game.bettingLapComplete = true;
    }
  }

  if (game.currentPhase === 'BETTING') {
    if (active.every(p => spendableFor(p, game.settings) === 0)) {
      beginDicePhase(game, rng);
      return 'DICE';
    }
    const allMatched = active.every(
      p => spendableFor(p, game.settings) === 0 || p.betThisRound === game.currentBet
    );
    if (game.bettingLapComplete && allMatched) {
      beginDicePhase(game, rng);
      return 'DICE';
    }
  }

  return game.currentPhase;
}

export function beginDicePhase(game: GameState, rng: Rng = Math.random): void {
  game.currentPhase = 'DICE';
  game.turnExpires = null;
  const d1 = Math.floor(rng() * 6) + 1;
  const d2 = Math.floor(rng() * 6) + 1;
  game.lastDiceRoll = [d1, d2];
  game.shiftPending = d1 === d2;
  game.shiftTriggered = false;
  game.logs.push(`Spike Dice rolled: [${d1}] [${d2}]${d1 === d2 ? ' — DOUBLES!' : ''}`);
  trimLogs(game);
}

/** Stage 2 of Sabacc Shift: sweeps unfolded hands to discard and deals fresh replacements. */
export function executeSabaccShift(game: GameState, rng: Rng = Math.random): void {
  if (!game.shiftPending) return;
  game.shiftPending = false;
  game.shiftTriggered = true;
  game.logs.push('⚡ SABACC SHIFT! All active hands swept and redealt.');

  const now = Date.now();
  for (const p of game.players) {
    if (p.isFolded || p.isSpectator) continue;
    const count = p.hand.length;
    game.discardPile.push(...p.hand);
    p.hand = [];
    for (let i = 0; i < count; i++) {
      p.hand.push(drawFromShoe(game, rng));
    }
    if (p.isAI) {
      const quip = maybePickQuip(p.personaId, 'shift', 0.45, rng);
      if (quip) p.lastAction = { text: quip, tone: 'quips', timestamp: now };
    }
  }
  trimLogs(game);
}

/** Completes DICE phase into next CARD round or Round 3 SHOWDOWN. */
export function finishDicePhase(game: GameState, rng: Rng = Math.random): 'CARD' | 'SHOWDOWN' {
  if (game.shiftPending) {
    executeSabaccShift(game, rng);
  }
  game.shiftTriggered = false;

  if (game.currentRound < 3) {
    game.currentRound++;
    game.currentPhase = 'CARD';
    game.turnIndex = nextEligibleIndex(game, game.dealerIndex, false);
    game.logs.push(`Round ${game.currentRound} Card Phase.`);
    trimLogs(game);
    return 'CARD';
  }

  executeShowdown(game, rng);
  return 'SHOWDOWN';
}

export function executeShowdown(game: GameState, rng: Rng = Math.random): void {
  game.currentPhase = 'SHOWDOWN';
  game.turnExpires = null;

  const { result, winnerIds } = resolveShowdown(game, game.settings.tieRule, rng);
  game.showdownResult = result;
  game.winnerIds = winnerIds;
  game.winnerId = winnerIds[0] ?? null;
  game.gamesPlayed++;

  const now = Date.now();
  const totalWonByPlayer = new Map<string, number>();
  for (const pay of result.payouts) {
    const share = Math.floor(pay.amount / Math.max(1, pay.winnerIds.length));
    for (const wid of pay.winnerIds) {
      totalWonByPlayer.set(wid, (totalWonByPlayer.get(wid) ?? 0) + share);
    }
  }

  for (const p of game.players) {
    const participated = p.contributed > 0 || p.hand.length > 0;
    syncLedgerPlayer(game, p);
    const entry = game.ledger[p.id];
    if (entry && participated && !p.isSpectator) {
      entry.handsPlayed += 1;
      if (winnerIds.includes(p.id)) {
        entry.handsWon += 1;
        const potWon = totalWonByPlayer.get(p.id) ?? 0;
        if (potWon > entry.biggestPot) entry.biggestPot = potWon;
      }
    }

    if (p.isAI) {
      if (winnerIds.includes(p.id)) {
        const quip = maybePickQuip(p.personaId, 'win', 0.5, rng);
        if (quip) p.lastAction = { text: quip, tone: 'quips', timestamp: now };
      } else if (p.credits < totalAnte(game.settings)) {
        const quip = maybePickQuip(p.personaId, 'bust', 0.7, rng);
        if (quip) p.lastAction = { text: quip, tone: 'quips', timestamp: now };
      }
    }

    p.contributed = 0;
    p.betThisRound = 0;
    p.isReady = !!(p.isAI || p.isSpectator);
  }

  // Update Cantina Tour / Daily Kessel Run meta-state for the human pilot.
  const human = game.players.find(p => !p.isAI && !p.isSpectator);
  if (human && game.tour) {
    const minReq = totalAnte(game.settings);
    if (human.credits >= game.tour.targetCredits) {
      game.tour.stageCleared = true;
      if (game.tour.stageIndex >= 4) {
        game.tour.tourCompleted = true;
        game.logs.push(`🏆 CANTINA TOUR CONQUERED! ${human.name} cleared Canto Bight with ${human.credits} CR!`);
      } else {
        game.logs.push(`★ Stage Cleared! ${human.name} reached ${human.credits} / ${game.tour.targetCredits} CR!`);
      }
    } else if (human.credits < minReq) {
      game.tour.runFailed = true;
      game.logs.push(`💥 Run Over! ${human.name} busted out at ${game.tour.venueName}.`);
    }
  }

  if (human && game.daily) {
    const standing = result.standings.find(s => s.playerId === human.id);
    const evalSummary = standing ? standing.evaluation : evaluateHand(human.hand);
    // Account for both handPot netDelta and sabaccAnte (-5 CR paid on deal):
    const sabaccPaid = game.settings.sabaccAnte;
    const delta = standing ? standing.netDelta - sabaccPaid : -(sabaccPaid + game.settings.ante);

    game.daily.handsCompleted += 1;
    game.daily.history.push({
      handNumber: game.daily.handsCompleted,
      delta,
      rankName: standing ? evalSummary.rankName : 'Folded',
      rankKey: standing ? evalSummary.rankKey : 'nulrhek',
      shifted: !!game.lastDiceRoll && game.lastDiceRoll[0] === game.lastDiceRoll[1],
      won: winnerIds.includes(human.id),
    });

    if (
      game.daily.handsCompleted >= game.daily.maxHands ||
      human.credits < totalAnte(game.settings)
    ) {
      game.daily.finished = true;
      game.logs.push(
        `🏁 Daily Kessel Run complete! Final stack: ${human.credits} CR.`
      );
    }
  }

  // In casual party mode only, auto-spectate broke humans ONLY if lockedCredits is true?
  // Better: keep them seated so the UI offers a clean Buy-In / Re-buy prompt rather than kicking them to Spectator!
  trimLogs(game);
}

/** Runs one AI decision immediately on `game`. */
export function performBotTurn(game: GameState, rng: Rng = Math.random): GameState['currentPhase'] {
  const bot = game.players[game.turnIndex];
  if (!bot || !bot.isAI || bot.isFolded) return game.currentPhase;

  const profile = profileFor(bot.botSkill);
  const evaluation = evaluateHand(bot.hand);

  if (game.currentPhase === 'CARD') {
    const topDiscard = game.discardPile.length > 0 ? game.discardPile[game.discardPile.length - 1] : null;
    const choice = decideCard(
      profile,
      { hand: bot.hand, evaluation, topDiscard, discardPile: game.discardPile },
      rng
    );
    return applyCardAction(game, bot.id, choice.action, choice.cardId, rng).nextPhase;
  }

  if (game.currentPhase === 'BETTING') {
    const callAmount = Math.max(0, game.currentBet - bot.betThisRound);
    const spendable = spendableFor(bot, game.settings);
    const activeCount = game.players.filter(p => !p.isFolded && !p.isSpectator).length;
    const roundsLeft = Math.max(1, 4 - game.currentRound);
    const choice = decideBet(
      profile,
      {
        hand: bot.hand,
        evaluation,
        callAmount,
        currentBet: game.currentBet,
        spendable,
        ante: game.settings.ante,
        pot: game.handPot + game.sabaccPot,
        minRaise: game.minRaise,
        roundsLeft,
        playersIn: activeCount,
      },
      rng
    );
    return applyBetAction(game, bot.id, choice.action, choice.amount, rng).nextPhase;
  }

  return game.currentPhase;
}

/** Advances a Cantina Tour room to the next stage while keeping the player's earned stack. */
export function advanceCantinaTourStage(game: GameState, rng: Rng = Math.random): boolean {
  if (game.mode !== 'cantina_tour' || !game.tour || !game.tour.stageCleared || game.tour.tourCompleted) {
    return false;
  }
  const nextIndex = game.tour.stageIndex + 1;
  if (nextIndex >= 5) return false;

  const stage = getCantinaStage(nextIndex);
  const human = game.players.find(p => !p.isAI);
  if (!human) return false;

  game.settings = { ...stage.settings };
  game.tour = {
    stageIndex: nextIndex,
    venueName: stage.venueName,
    venueSubtitle: stage.venueSubtitle,
    targetCredits: Math.max(stage.targetCredits, human.credits + stage.settings.ante * 15),
    stageCleared: false,
    tourCompleted: false,
    runFailed: false,
  };

  // Replace AI opponents with the new venue's roster; preserve human pilot.
  game.players = [human];
  human.hand = [];
  human.contributed = 0;
  human.betThisRound = 0;
  human.isFolded = false;
  human.isReady = true;

  for (const personaId of stage.rosterPersonaIds) {
    addBotToGame(game, { personaId, credits: stage.botStack }, rng);
  }

  game.currentPhase = 'JOINING';
  game.sabaccPot = 0;
  game.handPot = 0;
  game.dealerIndex = -1;
  game.logs.push(`🚀 Arrived at ${stage.venueName} (${stage.venueSubtitle})! Target: ${game.tour.targetCredits} CR.`);
  trimLogs(game);
  return true;
}
