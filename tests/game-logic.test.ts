import { strict as assert } from 'node:assert';
import test from 'node:test';
import { createDeck, evaluateHand, CardType, CardSuit, Card } from '../lib/game-logic';

const card = (id: string, value: number, suit = CardSuit.CIRCLE): Card => ({
  id,
  value,
  type: value === 0 ? CardType.SYLOP : value > 0 ? CardType.POSITIVE : CardType.NEGATIVE,
  suit: value === 0 ? CardSuit.NONE : suit,
});

test('deck is 62 cards: 30 positive, 30 negative, 2 Sylops', () => {
  const deck = createDeck();
  assert.equal(deck.length, 62);
  assert.equal(deck.filter(c => c.type === CardType.POSITIVE).length, 30);
  assert.equal(deck.filter(c => c.type === CardType.NEGATIVE).length, 30);
  assert.equal(deck.filter(c => c.type === CardType.SYLOP).length, 2);
  assert.equal(deck.reduce((sum, c) => sum + c.value, 0), 0);
});

test('Pure Sabacc is two Sylops', () => {
  assert.equal(evaluateHand([card('1', 0), card('2', 0)]).rankName, 'Pure Sabacc');
});

test('Squadron is four of a kind', () => {
  const hand = [
    card('1', 5, CardSuit.CIRCLE),
    card('2', 5, CardSuit.TRIANGLE),
    card('3', -5, CardSuit.CIRCLE),
    card('4', -5, CardSuit.TRIANGLE),
  ];
  assert.equal(evaluateHand(hand).rankName, 'Squadron');
});

test('Gee Whiz is +1,+2,+3,+4,-10', () => {
  const hand = [card('1', 1), card('2', 2), card('3', 3), card('4', 4), card('5', -10)];
  assert.equal(evaluateHand(hand).rankName, 'Gee Whiz');
});

test('Nulrhek hands report their distance from zero', () => {
  const evaluation = evaluateHand([card('1', 5), card('2', -2)]);
  assert.equal(evaluation.sum, 3);
  assert.equal(evaluation.absSum, 3);
});

test('a hand summing to zero outranks one that does not', () => {
  const zero = evaluateHand([card('1', 4), card('2', -4)]);
  const nonZero = evaluateHand([card('3', 4), card('4', -1)]);
  assert.ok(zero.score > nonZero.score);
});
