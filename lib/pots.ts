import {
  BlindDrawRound,
  Card,
  drawFromShoe,
  evaluateHand,
  HandEvaluation,
  PayoutItem,
  Player,
  ShowdownResult,
  ShowdownStanding,
  TieRule,
} from './game-logic';
import { Rng } from './prng';

export interface PotLayer {
  amount: number;
  eligible: string[];
}

/**
 * Splits Hand Pot contributions into Main Pot and Side Pots.
 * Short all-in players can only win layers they matched; folded players' chips
 * fund the pots without being eligible to win them.
 */
export function buildPots(players: Pick<Player, 'id' | 'contributed' | 'isFolded' | 'hand' | 'isSpectator'>[]): PotLayer[] {
  let rows = players
    .filter(p => p.contributed > 0)
    .map(p => ({
      id: p.id,
      left: p.contributed,
      folded: p.isFolded || !!p.isSpectator || p.hand.length === 0,
    }));

  const pots: PotLayer[] = [];
  while (rows.length > 0) {
    const min = Math.min(...rows.map(r => r.left));
    const amount = min * rows.length;
    const eligible = rows.filter(r => !r.folded).map(r => r.id);

    if (eligible.length > 0) {
      pots.push({ amount, eligible });
    } else if (pots.length > 0) {
      pots[pots.length - 1].amount += amount;
    }

    for (const r of rows) r.left -= min;
    rows = rows.filter(r => r.left > 0);
  }
  return pots;
}

/** Orders a subset of seats clockwise starting immediately left of the dealer. */
export function seatOrder<T extends { id: string }>(
  allPlayers: { id: string }[],
  dealerIndex: number,
  subset: T[]
): T[] {
  const n = Math.max(1, allPlayers.length);
  const rank = (p: T) => {
    const idx = allPlayers.findIndex(q => q.id === p.id);
    return ((idx - dealerIndex - 1) % n + n) % n;
  };
  return [...subset].sort((a, b) => rank(a) - rank(b));
}

/** Single-card blind draw score: closest to 0 wins; positive beats negative (+3 > -3). */
function blindCardScore(card: Card): number {
  const abs = Math.abs(card.value);
  return (20 - abs) * 10 + (card.value > 0 ? 5 : card.value === 0 ? 8 : 0);
}

function breakTieWithBlindDraw(
  tied: Player[],
  shoeState: { deck: Card[]; discardPile: Card[]; logs: string[] },
  blindDrawRounds: BlindDrawRound[],
  rng: Rng
): Player[] {
  let contenders = [...tied];
  for (let round = 1; round <= 5 && contenders.length > 1; round++) {
    const draws = contenders.map(p => {
      const card = drawFromShoe(shoeState, rng);
      return { player: p, card, score: blindCardScore(card) };
    });
    blindDrawRounds.push({
      round,
      draws: draws.map(d => ({ playerId: d.player.id, name: d.player.name, card: d.card })),
    });
    const summary = draws
      .map(d => `${d.player.name} drew ${d.card.value > 0 ? `+${d.card.value}` : d.card.value}`)
      .join(', ');
    shoeState.logs.push(`Blind Draw #${round}: ${summary}`);

    const best = Math.max(...draws.map(d => d.score));
    contenders = draws.filter(d => d.score === best).map(d => d.player);
  }
  return contenders;
}

export function resolveShowdown(
  state: {
    players: Player[];
    dealerIndex: number;
    handPot: number;
    sabaccPot: number;
    deck: Card[];
    discardPile: Card[];
    logs: string[];
  },
  tieRule: TieRule = 'split',
  rng: Rng = Math.random
): { result: ShowdownResult; winnerIds: string[] } {
  const shown = state.players.filter(p => !p.isFolded && !p.isSpectator && p.hand.length > 0);
  const evals = new Map<string, HandEvaluation>();
  for (const p of shown) {
    evals.set(p.id, evaluateHand(p.hand));
  }

  const creditsBefore = new Map(state.players.map(p => [p.id, p.credits]));
  const payouts: PayoutItem[] = [];
  const winnerIds = new Set<string>();
  const blindDrawRounds: BlindDrawRound[] = [];

  if (shown.length === 0) {
    state.logs.push('No active hands at showdown. Pots carry over.');
    return {
      result: { standings: [], payouts: [], sabaccPotCarried: state.sabaccPot > 0, blindDrawRounds: [] },
      winnerIds: [],
    };
  }

  let pots = buildPots(state.players);
  // Fallback if handPot was carried over from an uncontested empty round with 0 fresh contributions:
  const totalBuilt = pots.reduce((sum, p) => sum + p.amount, 0);
  if (state.handPot > totalBuilt) {
    const diff = state.handPot - totalBuilt;
    if (pots.length > 0) pots[0].amount += diff;
    else pots = [{ amount: diff, eligible: shown.map(p => p.id) }];
  }

  // Cache blind-draw tie resolution per tied contender group so Main & Sabacc pots agree.
  const resolvedTieGroup = new Map<string, Player[]>();
  const pickWinners = (contenders: Player[]): Player[] => {
    const scoreFn = (p: Player) => (tieRule === 'blind_draw' ? evals.get(p.id)!.scoreNoSuit : evals.get(p.id)!.score);
    const best = Math.max(...contenders.map(scoreFn));
    let winners = seatOrder(state.players, state.dealerIndex, contenders.filter(p => scoreFn(p) === best));

    if (winners.length > 1 && tieRule === 'blind_draw') {
      const groupKey = winners.map(w => w.id).sort().join('|');
      const cached = resolvedTieGroup.get(groupKey);
      if (cached) {
        winners = cached;
      } else {
        winners = seatOrder(
          state.players,
          state.dealerIndex,
          breakTieWithBlindDraw(winners, state, blindDrawRounds, rng)
        );
        resolvedTieGroup.set(groupKey, winners);
      }
    }
    return winners;
  };

  pots.forEach((pot, idx) => {
    const contenders = pot.eligible
      .map(id => shown.find(p => p.id === id))
      .filter((p): p is Player => !!p);
    if (contenders.length === 0 || pot.amount <= 0) return;

    const winners = pickWinners(contenders);
    const each = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - each * winners.length;
    for (const w of winners) {
      w.credits += each + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      winnerIds.add(w.id);
    }

    const label = pots.length === 1 || idx === 0 ? 'Main Pot' : `Side Pot ${idx}`;
    const names = winners.map(w => w.name);
    const split = winners.length > 1;
    payouts.push({
      label,
      winnerIds: winners.map(w => w.id),
      winnerNames: names,
      amount: pot.amount,
      split,
    });

    if (split) {
      state.logs.push(`${label} (${pot.amount} CR) split between ${names.join(' & ')}.`);
    } else {
      state.logs.push(`${winners[0].name} won ${label} (${pot.amount} CR) with ${evals.get(winners[0].id)!.rankName}.`);
    }
  });

  state.handPot = 0;

  // Sabacc Pot: awarded to the best hand at the table if it is a Specialty Sabacc.
  const overallWinners = pickWinners(shown);
  const topEval = evals.get(overallWinners[0].id)!;
  let sabaccPotCarried = false;

  if (state.sabaccPot > 0) {
    if (topEval.isSpecialty) {
      const potAmount = state.sabaccPot;
      const each = Math.floor(potAmount / overallWinners.length);
      let remainder = potAmount - each * overallWinners.length;
      for (const w of overallWinners) {
        w.credits += each + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        winnerIds.add(w.id);
      }
      payouts.push({
        label: 'Sabacc Pot',
        winnerIds: overallWinners.map(w => w.id),
        winnerNames: overallWinners.map(w => w.name),
        amount: potAmount,
        split: overallWinners.length > 1,
      });
      state.logs.push(
        `${overallWinners.map(w => w.name).join(' & ')} claimed the Sabacc Pot (${potAmount} CR) with ${topEval.rankName}!`
      );
      state.sabaccPot = 0;
    } else {
      sabaccPotCarried = true;
      if (topEval.isSabacc) {
        state.logs.push(`Plain Sabacc does not claim the Sabacc Pot (${state.sabaccPot} CR carries over).`);
      }
    }
  }

  const standings: ShowdownStanding[] = [...shown]
    .sort((a, b) => evals.get(b.id)!.score - evals.get(a.id)!.score)
    .map(p => {
      // Net delta across the entire hand = final credits - (credits before payout - contributed).
      const preShowdown = creditsBefore.get(p.id) ?? p.credits;
      const wonFromPots = p.credits - preShowdown;
      return {
        playerId: p.id,
        name: p.name,
        hand: [...p.hand],
        evaluation: evals.get(p.id)!,
        netDelta: wonFromPots - p.contributed,
        isWinner: winnerIds.has(p.id),
      };
    });

  const netByPlayer: Record<string, number> = {};
  for (const p of state.players) {
    if (p.isSpectator) continue;
    if (p.handStartCredits !== undefined) {
      netByPlayer[p.id] = p.credits - p.handStartCredits;
    } else {
      const preShowdown = creditsBefore.get(p.id) ?? p.credits;
      netByPlayer[p.id] = p.credits - preShowdown - p.contributed;
    }
  }

  return {
    result: { standings, payouts, sabaccPotCarried, blindDrawRounds, netByPlayer },
    winnerIds: [...winnerIds],
  };
}
