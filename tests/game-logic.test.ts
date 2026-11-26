import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  Card,
  CardSuit,
  CardType,
  createDeck,
  drawFromShoe,
  evaluateHand,
  HAND_CODEX_META,
  previewSwap,
} from '../lib/game-logic';
import { encodeQrMatrix } from '../lib/qr';

const card = (id: string, value: number, suit = CardSuit.CIRCLE): Card => ({
  id,
  value,
  type: value === 0 ? CardType.SYLOP : value > 0 ? CardType.POSITIVE : CardType.NEGATIVE,
  suit: value === 0 ? CardSuit.NONE : suit,
});

test('deck is 62 cards: 30 positive, 30 negative, 2 Sylops summing to zero', () => {
  const deck = createDeck();
  assert.equal(deck.length, 62);
  assert.equal(deck.filter(c => c.type === CardType.POSITIVE).length, 30);
  assert.equal(deck.filter(c => c.type === CardType.NEGATIVE).length, 30);
  assert.equal(deck.filter(c => c.type === CardType.SYLOP).length, 2);
  assert.equal(deck.reduce((sum, c) => sum + c.value, 0), 0);
  assert.equal(HAND_CODEX_META.length, 13);
});

test('recognizes all 13 Corellian Spike hand ranks in strict descending order', () => {
  const hands: [string, Card[]][] = [
    ['Pure Sabacc', [card('1', 0), card('2', 0)]],
    ['Full Sabacc', [card('1', 0), card('2', 10), card('3', 10), card('4', -10), card('5', -10)]],
    ['Fleet', [card('1', 0), card('2', 5), card('3', 5), card('4', -5), card('5', -5)]],
    ['Yee-Haa', [card('1', 0), card('2', 4), card('3', -4)]],
    ['Rhylet', [card('1', 2), card('2', 2), card('3', 2), card('4', -3), card('5', -3)]],
    ['Squadron', [card('1', 6), card('2', 6), card('3', -6), card('4', -6)]],
    ['Gee Whiz', [card('1', 1), card('2', 2), card('3', 3), card('4', 4), card('5', -10)]],
    ['Straight Khyron', [card('1', 7), card('2', -8), card('3', -9), card('4', 10)]],
    ['Banthas Wild', [card('1', 4), card('2', 4), card('3', 4), card('4', -3), card('5', -9)]],
    ['Rule of Two', [card('1', 9), card('2', -9), card('3', 4), card('4', -4)]],
    ['Sabacc (Pair)', [card('1', 5), card('2', -5)]],
    ['Sabacc', [card('1', 7), card('2', -3), card('3', -4)]],
    ['Nulrhek (+1)', [card('1', 5), card('2', -4)]],
  ];

  const scores = hands.map(([expectedName, h]) => {
    const ev = evaluateHand(h);
    assert.equal(ev.rankName, expectedName);
    return ev.score;
  });

  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i - 1] > scores[i], `rank ${i - 1} must beat rank ${i}`);
  }
});

test('most-cards tie-breaker is never overflowed by a higher positiveSum', () => {
  // Regression test: both hands are Nulrhek (+10).
  // 4-card (+4,+3,+2,+1) must beat 3-card (+10,+10,-10) even though positiveSum 20 > 10.
  const fourCards = evaluateHand([card('1', 4), card('2', 3), card('3', 2), card('4', 1)]);
  const threeCards = evaluateHand([card('5', 10), card('6', 10), card('7', -10)]);
  assert.equal(fourCards.sum, 10);
  assert.equal(threeCards.sum, 10);
  assert.ok(fourCards.score > threeCards.score, '4 cards must outrank 3 cards at the same Nulrhek value');
});

test('specialty hand ties go to the lower integer value per Corellian Spike rules', () => {
  const lowPair = evaluateHand([card('1', 2), card('2', -2)]);
  const highPair = evaluateHand([card('3', 9), card('4', -9)]);
  assert.equal(lowPair.rankName, 'Sabacc (Pair)');
  assert.equal(highPair.rankName, 'Sabacc (Pair)');
  assert.ok(lowPair.score > highPair.score, '+2/-2 pair must outrank +9/-9 pair');

  const lowSquad = evaluateHand([card('1', 3), card('2', 3), card('3', -3), card('4', -3)]);
  const highSquad = evaluateHand([card('5', 8), card('6', 8), card('7', -8), card('8', -8)]);
  assert.ok(lowSquad.score > highSquad.score, 'quad 3s must outrank quad 8s');
});

test('all-negative Nulrhek hands break ties by card closest to zero and suit', () => {
  const circleMinus2 = evaluateHand([card('1', -2, CardSuit.CIRCLE), card('2', -4, CardSuit.SQUARE)]);
  const squareMinus2 = evaluateHand([card('3', -2, CardSuit.SQUARE), card('4', -4, CardSuit.CIRCLE)]);
  assert.ok(circleMinus2.score > squareMinus2.score, 'Circle suit on -2 must beat Square suit on -2');
});

test('drawFromShoe reshuffles discards beneath top discard without duplicating cards', () => {
  const shoe = {
    deck: [] as Card[],
    discardPile: [card('d1', 3), card('d2', -7), card('top', 9)],
    logs: [] as string[],
  };
  const drawn = drawFromShoe(shoe);
  assert.ok(drawn.id === 'd1' || drawn.id === 'd2', 'must draw from reshuffled underneath discards');
  assert.equal(shoe.discardPile.length, 1);
  assert.equal(shoe.discardPile[0].id, 'top', 'face-up top discard stays put');
  assert.equal(shoe.deck.length, 1);
});

test('previewSwap computes exact candidate rank before committing move', () => {
  const hand = [card('a', -10), card('b', 6)];
  const preview = previewSwap(hand, 'a', card('disc', -6));
  assert.ok(preview);
  assert.equal(preview.sum, 0);
  assert.equal(preview.rankName, 'Sabacc (Pair)');
  assert.equal(preview.isSpecialty, true);
});

test('encodeQrMatrix produces valid ISO QR finder patterns for LAN join URLs', () => {
  const m = encodeQrMatrix('http://192.168.1.42:3000/?room=XKQ7P');
  assert.ok(m, 'matrix should encode 36-byte LAN URL');
  assert.equal(m.length, 29, '36 bytes fits Version 3-L (29x29)');
  // Top-left 7x7 finder outer corners & center 3x3 dark block:
  assert.equal(m[0][0], true);
  assert.equal(m[0][6], true);
  assert.equal(m[6][0], true);
  assert.equal(m[3][3], true);
  assert.equal(m[1][1], false);
});
