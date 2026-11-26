import { strict as assert } from 'node:assert';
import test from 'node:test';
import { BOT_PROFILES, decideBet, decideCard, profileFor, worstCard } from '../lib/bots';
import { beatsOne, bestCardAction, equityOf, shiftAdjusted, unseenCards } from '../lib/equity';
import { Card, CardSuit, CardType, createDeck, evaluateHand } from '../lib/game-logic';
import { createSeededRng } from '../lib/prng';
import {
  addBotToGame,
  createRoomState,
  dealNewHand,
  finishDicePhase,
  performBotTurn,
} from '../lib/room-engine';

const card = (id: string, value: number, suit = CardSuit.CIRCLE): Card => ({
  id,
  value,
  type: value === 0 ? CardType.SYLOP : value > 0 ? CardType.POSITIVE : CardType.NEGATIVE,
  suit: value === 0 ? CardSuit.NONE : suit,
});

const steady = () => 0.99;

test('reference equity curve orders Pure Sabacc > Plain Sabacc > Near Miss > +19', () => {
  const pure = beatsOne(evaluateHand([card('a', 0), card('b', 0)]).score);
  const plain = beatsOne(evaluateHand([card('a', 4), card('b', -4)]).score);
  const near = beatsOne(evaluateHand([card('a', 5), card('b', -4)]).score);
  const junk = beatsOne(evaluateHand([card('a', 10), card('b', 9)]).score);

  assert.ok(pure > plain && plain > near && near > junk);
  assert.ok(pure > 0.99);
  assert.ok(junk < 0.2);
  assert.ok(equityOf([card('a', 3), card('b', -3)], 5) < equityOf([card('a', 3), card('b', -3)], 1));
});

test('Shark bestCardAction spots exact Sabacc that naive worstCard heuristic misses', () => {
  const hand = [card('a', 9), card('b', 2)];
  assert.equal(worstCard(hand, 11).id, 'a');

  const best = bestCardAction(hand, [card('d', -9)]);
  assert.equal(best.action, 'swap_discard');
  assert.equal(best.cardId, 'b', 'throwing +2 for -9 lands on +9/-9 Sabacc (Pair)');
});

test('unseenCards excludes held cards and discards accurately', () => {
  const hand = [card('h1', 7, CardSuit.CIRCLE), card('h2', -3, CardSuit.SQUARE)];
  const discards = [card('d1', 7, CardSuit.TRIANGLE)];
  const unseen = unseenCards(hand, discards);
  assert.equal(unseen.length, createDeck().length - 3);
  const sevens = unseen.filter(c => c.value === 7);
  assert.equal(sevens.length, 1);
  assert.equal(sevens[0].suit, CardSuit.SQUARE);
});

test('Shark folds bad pot odds that Novice calls, and discounts Round 1 Shift risk', () => {
  const { novice, shark } = BOT_PROFILES;
  assert.equal(profileFor('unknown').key, 'regular');

  const marginalHand = [card('a', 6), card('b', -2)];
  const view = {
    hand: marginalHand,
    evaluation: evaluateHand(marginalHand),
    callAmount: 40,
    currentBet: 40,
    spendable: 1000,
    ante: 10,
    pot: 60,
    minRaise: 10,
    roundsLeft: 1,
    playersIn: 2,
  };
  assert.equal(decideBet(novice, view, steady).action, 'call');
  assert.equal(decideBet(shark, view, steady).action, 'fold');

  assert.ok(shiftAdjusted(0.95, 3, 4) < shiftAdjusted(0.95, 1, 4));
  for (const prof of Object.values(BOT_PROFILES)) {
    const made = [card('x', 4), card('y', -4)];
    assert.equal(decideCard(prof, { hand: made, evaluation: evaluateHand(made), topDiscard: card('z', 1) }, steady).action, 'stand');
  }
});

test('Sharks outperform Novices over 100 simulated hands while strictly conserving every chip', () => {
  const rng = createSeededRng('shark-vs-novice-benchmark-2026');
  const { game } = createRoomState({ roomId: 'BENCH', mode: 'party', stakesTier: 'medium' });

  for (let i = 0; i < 6; i++) {
    addBotToGame(
      game,
      { skill: i % 2 === 0 ? 'shark' : 'novice', credits: 20_000 },
      rng
    );
  }

  const totalChips = () =>
    game.players.reduce((n, p) => n + p.credits, 0) + game.handPot + game.sabaccPot;
  const initialTotal = totalChips();
  const startBySeat = new Map(game.players.map(p => [p.id, p.credits]));

  for (let hand = 0; hand < 100; hand++) {
    dealNewHand(game, rng);
    for (let step = 0; step < 400; step++) {
      if (game.currentPhase === 'SHOWDOWN' || game.currentPhase === 'JOINING') break;
      if (game.currentPhase === 'DICE') {
        finishDicePhase(game, rng);
        continue;
      }
      performBotTurn(game, rng);
    }
    assert.equal(game.currentPhase, 'SHOWDOWN');
    assert.equal(totalChips(), initialTotal, `chip conservation violated on hand ${hand + 1}`);
    assert.ok(game.players.every(p => p.credits >= 0), 'negative stack detected');
  }

  const sharkNet = game.players
    .filter(p => p.botSkill === 'shark')
    .reduce((s, p) => s + (p.credits - startBySeat.get(p.id)!), 0);
  const noviceNet = game.players
    .filter(p => p.botSkill === 'novice')
    .reduce((s, p) => s + (p.credits - startBySeat.get(p.id)!), 0);

  assert.ok(
    sharkNet > noviceNet,
    `Sharks (${sharkNet}) should finish ahead of Novices (${noviceNet})`
  );
  assert.ok(sharkNet > 0, `Sharks should profit overall, got ${sharkNet}`);
});
