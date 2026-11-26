/**
 * Exact unseen-deck enumeration and reference opponent hand-strength curve.
 * Ported from foundry-sabacc/scripts/equity.js — uses only public information
 * (the bot's own cards and the face-up discard pile).
 */

import { Card, createDeck, evaluateHand, shuffle } from './game-logic';
import { createSeededRng, Rng } from './prng';

const SAMPLE_HANDS = 3000;
const SHIFT_SURVIVAL = 5 / 6; // Doubles on 2d6 triggers a Sabacc Shift (1/6).
const SIZE_WEIGHTS: [number, number][] = [
  [2, 0.2],
  [3, 0.35],
  [4, 0.3],
  [5, 0.15],
];

let curve: number[] | null = null;

function rollSize(rng: Rng): number {
  let roll = rng();
  for (const [size, weight] of SIZE_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return size;
  }
  return 3;
}

function playOut(deck: Card[], size: number, rounds = 3): Card[] {
  const hand = deck.splice(0, size);
  for (let round = 0; round < rounds && deck.length > 0; round++) {
    const sum = hand.reduce((n, c) => n + c.value, 0);
    if (sum === 0) break;

    let worstIndex = 0;
    let bestImpact = -Infinity;
    hand.forEach((card, i) => {
      const impact = Math.abs(sum) - Math.abs(sum - card.value);
      if (impact > bestImpact) {
        bestImpact = impact;
        worstIndex = i;
      }
    });

    const candidate = deck.pop()!;
    const without = sum - hand[worstIndex].value;
    if (Math.abs(without + candidate.value) < Math.abs(sum)) {
      hand[worstIndex] = candidate;
    }
  }
  return hand;
}

/** Deterministic reference curve so Shark equity is stable and instant after warm-up. */
function reference(): number[] {
  if (curve) return curve;
  const rng = createSeededRng('sabacc-reference-curve-v1');
  const scores: number[] = [];
  for (let i = 0; i < SAMPLE_HANDS; i++) {
    const deck = shuffle(createDeck(), rng);
    scores.push(evaluateHand(playOut(deck, rollSize(rng))).score);
  }
  curve = scores.sort((a, b) => a - b);
  return curve;
}

export function resetReference(): void {
  curve = null;
}

/** Probability that one played-out opponent holds a weaker hand than `score`. */
export function beatsOne(score: number): number {
  const scores = reference();
  let low = 0;
  let high = scores.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (scores[mid] < score) low = mid + 1;
    else high = mid;
  }
  return low / scores.length;
}

export function equityOf(hand: Card[] | undefined, opponents = 1): number {
  if (!hand || hand.length === 0) return 0;
  return beatsOne(evaluateHand(hand).score) ** Math.max(1, opponents);
}

/** Discounts hand equity for remaining Sabacc Shift checks before Showdown. */
export function shiftAdjusted(equity: number, roundsLeft: number, playersIn: number): number {
  const survives = SHIFT_SURVIVAL ** Math.max(0, roundsLeft);
  return survives * equity + (1 - survives) * (1 / Math.max(2, playersIn));
}

/** Returns all cards in a 62-card deck not visible in `hand` or `discardPile`. */
export function unseenCards(hand: Card[], discardPile: Card[]): Card[] {
  const counts = new Map<string, number>();
  for (const card of [...hand, ...discardPile]) {
    const key = `${card.value}:${card.suit}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return createDeck().filter(card => {
    const key = `${card.value}:${card.suit}`;
    const left = counts.get(key);
    if (!left) return true;
    counts.set(key, left - 1);
    return false;
  });
}

const mean = (xs: number[]): number => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface CardActionChoice {
  action: 'stand' | 'draw' | 'swap_deck' | 'swap_discard';
  cardId?: string;
  equity: number;
}

/** Enumerates every unseen card for every legal card-phase move and picks highest EV. */
export function bestCardAction(
  hand: Card[],
  discardPile: Card[],
  { maxHand = 5 }: { maxHand?: number } = {}
): CardActionChoice {
  const unseen = unseenCards(hand, discardPile);
  const topDiscard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  const options: CardActionChoice[] = [
    { action: 'stand', equity: beatsOne(evaluateHand(hand).score) },
  ];

  if (hand.length < maxHand && unseen.length > 0) {
    options.push({
      action: 'draw',
      equity: mean(unseen.map(card => beatsOne(evaluateHand([...hand, card]).score))),
    });
  }

  hand.forEach((held, i) => {
    const rest = hand.filter((_, j) => j !== i);
    if (unseen.length > 0) {
      options.push({
        action: 'swap_deck',
        cardId: held.id,
        equity: mean(unseen.map(card => beatsOne(evaluateHand([...rest, card]).score))),
      });
    }
    if (topDiscard) {
      options.push({
        action: 'swap_discard',
        cardId: held.id,
        equity: beatsOne(evaluateHand([...rest, topDiscard]).score),
      });
    }
  });

  return options.reduce((best, option) => (option.equity > best.equity ? option : best));
}
