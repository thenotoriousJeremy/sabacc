/**
 * Novice, Regular, and Shark bot profiles.
 * Ported from foundry-sabacc/scripts/bots.js with TypeScript types.
 */

import { beatsOne, bestCardAction, shiftAdjusted } from './equity';
import { BotSkill, Card, HandEvaluation } from './game-logic';
import { Rng } from './prng';

export interface BotProfile {
  key: BotSkill;
  blunderChance: number;
  standAt: number;
  callTolerance: number;
  bluffChance: number;
  raiseChance: number;
  usesPotOdds: boolean;
  solves?: boolean;
}

export const BOT_PROFILES: Record<BotSkill, BotProfile> = {
  novice: {
    key: 'novice',
    blunderChance: 0.3,
    standAt: 3,
    callTolerance: 8,
    bluffChance: 0,
    raiseChance: 0.25,
    usesPotOdds: false,
  },
  regular: {
    key: 'regular',
    blunderChance: 0.1,
    standAt: 1,
    callTolerance: 5,
    bluffChance: 0.06,
    raiseChance: 0.5,
    usesPotOdds: false,
  },
  shark: {
    key: 'shark',
    blunderChance: 0,
    standAt: 1,
    callTolerance: 3,
    bluffChance: 0.12,
    raiseChance: 1,
    usesPotOdds: true,
    solves: true,
  },
};

export function profileFor(key?: string): BotProfile {
  if (key && key in BOT_PROFILES) return BOT_PROFILES[key as BotSkill];
  return BOT_PROFILES.regular;
}

function roughEquity(evaluation: HandEvaluation): number {
  if (evaluation.isSabacc) return 0.62;
  if (evaluation.absSum <= 2) return 0.34;
  if (evaluation.absSum <= 5) return 0.2;
  return 0.07;
}

export function worstCard(hand: Card[], sum: number): Card {
  let best = hand[0];
  let bestImpact = -Infinity;
  for (const card of hand) {
    const impact = Math.abs(sum) - Math.abs(sum - card.value);
    if (impact > bestImpact) {
      bestImpact = impact;
      best = card;
    }
  }
  return best;
}

export interface CardView {
  hand: Card[];
  evaluation: HandEvaluation;
  topDiscard?: Card | null;
  discardPile?: Card[];
}

export interface BotCardDecision {
  action: 'stand' | 'draw' | 'swap_deck' | 'swap_discard';
  cardId?: string;
}

export function decideCard(profile: BotProfile, view: CardView, rng: Rng = Math.random): BotCardDecision {
  if (profile.solves) {
    const discard = view.discardPile ?? (view.topDiscard ? [view.topDiscard] : []);
    const best = bestCardAction(view.hand, discard);
    return { action: best.action, cardId: best.cardId };
  }

  const { hand, evaluation, topDiscard } = view;
  const { sum, absSum, isSabacc } = evaluation;
  const target = worstCard(hand, sum);

  if (rng() < profile.blunderChance) {
    return isSabacc || absSum <= profile.standAt
      ? { action: hand.length < 5 ? 'draw' : 'swap_deck', cardId: target?.id }
      : { action: 'stand' };
  }

  if (isSabacc || (absSum <= profile.standAt && hand.length >= 3)) return { action: 'stand' };

  if (hand.length < 3 && absSum > 5) return { action: 'draw' };

  const discardHelps = topDiscard && Math.abs(sum - target.value + topDiscard.value) < Math.abs(sum);
  if (discardHelps) return { action: 'swap_discard', cardId: target.id };

  if (hand.length >= 3 && absSum > 3 && hand.length < 5) return { action: 'draw' };

  return { action: 'swap_deck', cardId: target.id };
}

export interface BetView {
  hand?: Card[];
  evaluation: HandEvaluation;
  callAmount: number;
  currentBet: number;
  spendable: number;
  ante: number;
  pot: number;
  minRaise: number;
  roundsLeft?: number;
  playersIn?: number;
}

export interface BotBetDecision {
  action: 'fold' | 'check' | 'call' | 'raise' | 'all_in';
  amount?: number;
}

export function decideBet(profile: BotProfile, view: BetView, rng: Rng = Math.random): BotBetDecision {
  const { evaluation, callAmount, currentBet, spendable, ante, pot, minRaise } = view;
  const made = evaluation.isSabacc;
  const canCheck = callAmount <= 0;

  if (spendable <= 0) return { action: canCheck ? 'check' : 'call' };
  if (profile.solves) return solveBet(profile, view, rng);

  const raise = (): BotBetDecision => {
    const step = Math.max(minRaise, ante * 2);
    return step >= spendable ? { action: 'all_in' } : { action: 'raise', amount: step };
  };

  if (rng() < profile.blunderChance) {
    if (made) return { action: canCheck ? 'check' : 'fold' };
    return canCheck ? raise() : { action: 'call' };
  }

  if (made) {
    const cheapEnough = currentBet < ante * 5;
    return cheapEnough && rng() < profile.raiseChance ? raise() : { action: 'call' };
  }

  if (canCheck) {
    return rng() < profile.bluffChance ? raise() : { action: 'check' };
  }

  if (profile.usesPotOdds) {
    const price = callAmount / (pot + callAmount);
    return price <= roughEquity(evaluation) ? { action: 'call' } : { action: 'fold' };
  }

  const tolerance = ante * (evaluation.absSum <= 5 ? profile.callTolerance : Math.ceil(profile.callTolerance / 2));
  return callAmount > tolerance ? { action: 'fold' } : { action: 'call' };
}

function solveBet(profile: BotProfile, view: BetView, rng: Rng): BotBetDecision {
  const {
    hand,
    evaluation,
    callAmount,
    currentBet,
    spendable,
    pot,
    minRaise,
    roundsLeft = 1,
    playersIn = 2,
  } = view;

  const raw = hand && hand.length > 0 ? beatsOne(evaluation.score) : roughEquity(evaluation);
  const equity = shiftAdjusted(raw, roundsLeft, playersIn);
  const canCheck = callAmount <= 0;

  const sized = (fraction: number): BotBetDecision => {
    const want = Math.max(minRaise, Math.round(pot * fraction));
    return want >= spendable ? { action: 'all_in' } : { action: 'raise', amount: want };
  };

  if (equity >= 0.82) return sized(1);
  if (equity >= 0.68) return currentBet > 0 && rng() < 0.4 ? { action: 'call' } : sized(0.6);

  if (canCheck) {
    const drawable = equity > 0.3 && roundsLeft > 0;
    return drawable && rng() < profile.bluffChance ? sized(0.5) : { action: 'check' };
  }

  const price = callAmount / (pot + callAmount);
  if (equity >= price) return { action: 'call' };

  const implied = roundsLeft > 0 && equity >= price * 0.75 && callAmount <= pot * 0.25;
  return implied ? { action: 'call' } : { action: 'fold' };
}
