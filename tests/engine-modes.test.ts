import { strict as assert } from 'node:assert';
import test from 'node:test';
import { formatKesselShareCard } from '../lib/daily-seed';
import { Card, CardSuit, CardType, Player } from '../lib/game-logic';
import { buildPots, resolveShowdown } from '../lib/pots';
import { createSeededRng } from '../lib/prng';
import {
  advanceCantinaTourStage,
  applyBetAction,
  beginDicePhase,
  createRoomState,
  dealNewHand,
  executeSabaccShift,
  finishDicePhase,
  performBotTurn,
  populateSoloBots,
  sanitizeStateFor,
  syncLedgerPlayer,
} from '../lib/room-engine';

const card = (id: string, value: number, suit = CardSuit.CIRCLE): Card => ({
  id,
  value,
  type: value === 0 ? CardType.SYLOP : value > 0 ? CardType.POSITIVE : CardType.NEGATIVE,
  suit: value === 0 ? CardSuit.NONE : suit,
});

const makePlayer = (id: string, credits: number, contributed = 0, hand: Card[] = []): Player => ({
  id,
  name: id,
  hand,
  credits,
  buyInTotal: credits + contributed,
  contributed,
  isFolded: false,
  isReady: true,
  betThisRound: 0,
  isConnected: true,
});

test('sanitizeStateFor strips deck and masks opponent hole cards and Sylop IDs until SHOWDOWN', () => {
  const { game } = createRoomState({ roomId: 'SEC01', mode: 'party' });
  const p1 = makePlayer('p1', 900, 10, [card('c-60', 0), card('c-1', 2)]);
  const p2 = makePlayer('p2', 900, 10, [card('c-61', 0), card('c-5', -2)]);
  game.players = [p1, p2];
  game.currentPhase = 'BETTING';

  const viewForP1 = sanitizeStateFor(game, 'p1');
  assert.equal('deck' in viewForP1, false, 'raw deck must never be broadcast');
  assert.equal(viewForP1.deckCount, 62);
  assert.equal(viewForP1.players[0].hand[0].id, 'c-60', 'viewer sees own Sylop');
  assert.equal(viewForP1.players[1].hand[0].hidden, true, 'opponent hole card must be masked');
  assert.notEqual(viewForP1.players[1].hand[0].id, 'c-61', 'opponent card ID must not leak Sylop index');

  // At SHOWDOWN, unfolded opponent hands reveal while folded hands stay hidden:
  const p3Folded = { ...makePlayer('p3', 900, 10, [card('c-9', 4)]), isFolded: true };
  game.players.push(p3Folded);
  game.currentPhase = 'SHOWDOWN';
  const showdownView = sanitizeStateFor(game, 'p1');
  assert.equal(showdownView.players[1].hand[0].hidden, undefined, 'unfolded opponent reveals at SHOWDOWN');
  assert.equal(showdownView.players[2].hand[0].hidden, true, 'folded hand remains private at SHOWDOWN');
});

test('buildPots constructs side pots for short all-ins and splits ties with odd chip left of dealer', () => {
  const pA = makePlayer('A', 0, 20, [card('1', 0), card('2', 0)]); // Pure Sabacc, short all-in for 20
  const pB = makePlayer('B', 500, 100, [card('3', 5), card('4', -5)]); // Sabacc Pair
  const pC = makePlayer('C', 500, 100, [card('5', 6), card('6', -2)]); // Nulrhek

  const layers = buildPots([pA, pB, pC]);
  assert.equal(layers.length, 2);
  assert.equal(layers[0].amount, 60);
  assert.deepEqual(layers[0].eligible.sort(), ['A', 'B', 'C']);
  assert.equal(layers[1].amount, 160);
  assert.deepEqual(layers[1].eligible.sort(), ['B', 'C']);

  const state = {
    players: [pA, pB, pC],
    dealerIndex: 0,
    handPot: 220,
    sabaccPot: 15,
    deck: [card('d1', 1)],
    discardPile: [],
    logs: [] as string[],
  };
  const { result } = resolveShowdown(state, 'split');
  assert.equal(pA.credits, 60 + 15, 'A wins 60 main pot + 15 Sabacc pot');
  assert.equal(pB.credits, 500 + 160, 'B wins 160 side pot that A could not cover');
  assert.equal(result.payouts.length, 3);

  // Odd-chip split test: L is immediately left of dealer D (index 0)
  const d = { ...makePlayer('D', 0, 0, []), isFolded: true };
  const l = makePlayer('L', 0, 50, [card('l1', 3, CardSuit.CIRCLE), card('l2', -3, CardSuit.SQUARE)]);
  const r = makePlayer('R', 0, 51, [card('r1', 3, CardSuit.CIRCLE), card('r2', -3, CardSuit.TRIANGLE)]);
  const tieState = {
    players: [d, l, r],
    dealerIndex: 0,
    handPot: 101,
    sabaccPot: 0,
    deck: [],
    discardPile: [],
    logs: [] as string[],
  };
  // Note: l has contributed 50, r has 51 -> wait: make both contribute 50 and 1 folded ante so 101 in single main pot!
  d.contributed = 1;
  l.contributed = 50;
  r.contributed = 50;
  resolveShowdown(tieState, 'split');
  assert.equal(l.credits, 51, 'odd chip goes left of dealer');
  assert.equal(r.credits, 50);
});

test('Single Blind Draw deals clockwise from left of dealer to resolve tied contenders', () => {
  const p1 = makePlayer('P1', 0, 50, [card('1', 4, CardSuit.CIRCLE), card('2', -4, CardSuit.SQUARE)]);
  const p2 = makePlayer('P2', 0, 50, [card('3', 4, CardSuit.TRIANGLE), card('4', -4, CardSuit.CIRCLE)]);
  const state = {
    players: [p1, p2],
    dealerIndex: 1, // P2 is dealer -> P1 sits left of dealer and draws first (+1)
    handPot: 100,
    sabaccPot: 0,
    deck: [card('bd2', -8), card('bd1', 1)],
    discardPile: [],
    logs: [] as string[],
  };
  const { result, winnerIds } = resolveShowdown(state, 'blind_draw');
  assert.equal(result.blindDrawRounds.length, 1);
  assert.equal(result.blindDrawRounds[0].draws[0].playerId, 'P1');
  assert.deepEqual(winnerIds, ['P1']);
  assert.equal(p1.credits, 100);
});

test('betting enforces minRaise and tableLimit while allowing short all-ins', () => {
  const { game } = createRoomState({ roomId: 'BET01', mode: 'party', stakesTier: 'low' });
  // low preset: ante 5, tableLimit 150
  const p1 = makePlayer('P1', 1000, 5, [card('1', 2)]);
  const p2 = makePlayer('P2', 1000, 5, [card('2', 3)]);
  game.players = [p1, p2];
  game.currentPhase = 'BETTING';
  game.dealerIndex = 1;
  game.turnIndex = 0;
  game.minRaise = 5;

  assert.equal(applyBetAction(game, 'P1', 'bet', 0).ok, false, '0 bet rejected');
  assert.equal(applyBetAction(game, 'P1', 'bet', 3).ok, false, 'below minRaise rejected');
  assert.equal(applyBetAction(game, 'P1', 'bet', 500).ok, false, 'above 150 tableLimit rejected');

  // All-in under a 150 limit commits 145 (since 5 ante already contributed), leaving 855 off-table:
  const res = applyBetAction(game, 'P1', 'all_in');
  assert.equal(res.ok, true);
  assert.equal(p1.contributed, 150);
  assert.equal(p1.credits, 855);
});

test('two-stage Sabacc Shift preserves hands during tumble, then sweeps and redeals on shift', () => {
  const { game } = createRoomState({ roomId: 'SHFT1', mode: 'party' });
  game.players = [makePlayer('P1', 500), makePlayer('P2', 500)];
  dealNewHand(game, createSeededRng('deal-seed'));
  const oldIds = game.players[0].hand.map(c => c.id);

  // Force doubles with custom rng returning 0.0 -> [1, 1]
  beginDicePhase(game, () => 0);
  assert.equal(game.shiftPending, true);
  assert.deepEqual(
    game.players[0].hand.map(c => c.id),
    oldIds,
    'hands stay intact during stage-1 dice tumble'
  );

  executeSabaccShift(game, createSeededRng('redeal-seed'));
  assert.equal(game.shiftPending, false);
  assert.equal(game.shiftTriggered, true);
  assert.equal(game.players[0].hand.length, 2);
  assert.notDeepEqual(game.players[0].hand.map(c => c.id), oldIds, 'hands replaced on stage-2 shift');
});

test('Cantina Tour advances stages preserving player bankroll, and Daily Kessel Run is 100% deterministic', () => {
  // 1. Cantina Tour
  const { game: tourGame } = createRoomState({ roomId: 'TOUR1', mode: 'cantina_tour' });
  const hero = makePlayer('Hero', 900);
  tourGame.players.push(hero);
  syncLedgerPlayer(tourGame, hero);
  populateSoloBots(tourGame, createSeededRng('tour'));
  assert.equal(tourGame.tour?.stageIndex, 0);
  tourGame.tour!.stageCleared = true;

  const advanced = advanceCantinaTourStage(tourGame, createSeededRng('tour-2'));
  assert.equal(advanced, true);
  assert.equal(tourGame.tour?.stageIndex, 1);
  assert.equal(tourGame.players[0].credits, 900, 'bankroll carries into Coronet Den');

  // 2. Daily Kessel Run determinism across two independent rooms
  const runDailySimulation = () => {
    const { game, rng } = createRoomState({
      roomId: 'KESS1',
      mode: 'daily_kessel',
      dailyDateKey: '2026-11-25',
    });
    const human = makePlayer('Solo', game.settings.startingCredits);
    game.players.push(human);
    populateSoloBots(game, rng);

    while (!game.daily?.finished) {
      dealNewHand(game, rng);
      for (let step = 0; step < 300; step++) {
        if (game.currentPhase === 'SHOWDOWN') break;
        if (game.currentPhase === 'DICE') {
          finishDicePhase(game, rng);
          continue;
        }
        const active = game.players[game.turnIndex];
        if (active.id === human.id) {
          if (game.currentPhase === 'CARD') {
            // Deterministic human line: stand
            active.lastAction = null;
            game.turnIndex = (game.turnIndex + 1) % game.players.length;
          } else {
            applyBetAction(game, human.id, game.currentBet > human.betThisRound ? 'call' : 'check', undefined, rng);
          }
        } else {
          performBotTurn(game, rng);
        }
      }
    }
    return { credits: human.credits, share: formatKesselShareCard(game.daily!, human.credits) };
  };

  const runA = runDailySimulation();
  const runB = runDailySimulation();
  assert.equal(runA.credits, runB.credits, 'identical date seed must produce identical Kessel Run outcome');
  assert.equal(runA.share, runB.share);
  assert.ok(runA.share.includes('SABACC • DAILY KESSEL RUN 2026-11-25'));
});
