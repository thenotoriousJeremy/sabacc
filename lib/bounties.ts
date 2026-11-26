import { ClientGameState } from './game-logic';
import { createSeededRng } from './prng';

export interface RepRankSpec {
  level: number;
  title: string;
  minXp: number;
  badgeColor: string;
}

export const REP_RANKS: RepRankSpec[] = [
  { level: 1, title: 'Docking Bay Novice', minXp: 0, badgeColor: 'text-slate-300 border-white/20' },
  { level: 2, title: 'Outer Rim Grinder', minXp: 150, badgeColor: 'text-emerald-300 border-emerald-400/40' },
  { level: 3, title: 'Corellian Sharp', minXp: 450, badgeColor: 'text-cyan-300 border-cyan-400/45' },
  { level: 4, title: 'Vandor High-Roller', minXp: 1000, badgeColor: 'text-sky-300 border-sky-400/50' },
  { level: 5, title: 'Cloud City Baron', minXp: 2000, badgeColor: 'text-amber-300 border-amber-400/55' },
  { level: 6, title: 'Crimson Syndicate VIP', minXp: 3600, badgeColor: 'text-rose-300 border-rose-400/55' },
  { level: 7, title: 'Canto Bight Legend', minXp: 6000, badgeColor: 'text-fuchsia-300 border-fuchsia-400/55' },
  { level: 8, title: 'Sabacc Grandmaster', minXp: 10000, badgeColor: 'text-amber-200 border-amber-300' },
];

export interface RepProgress {
  level: number;
  title: string;
  badgeColor: string;
  nextTitle: string | null;
  xp: number;
  floorXp: number;
  nextXp: number | null;
  pct: number;
}

export function getRepProgress(xp: number): RepProgress {
  const safeXp = Math.max(0, Math.floor(xp || 0));
  let idx = 0;
  for (let i = 0; i < REP_RANKS.length; i++) {
    if (safeXp >= REP_RANKS[i].minXp) idx = i;
  }
  const current = REP_RANKS[idx];
  const next = REP_RANKS[idx + 1] ?? null;
  if (!next) {
    return {
      level: current.level,
      title: current.title,
      badgeColor: current.badgeColor,
      nextTitle: null,
      xp: safeXp,
      floorXp: current.minXp,
      nextXp: null,
      pct: 100,
    };
  }
  const span = Math.max(1, next.minXp - current.minXp);
  const pct = Math.min(100, Math.max(0, Math.round(((safeXp - current.minXp) / span) * 100)));
  return {
    level: current.level,
    title: current.title,
    badgeColor: current.badgeColor,
    nextTitle: next.title,
    xp: safeXp,
    floorXp: current.minXp,
    nextXp: next.minXp,
    pct,
  };
}

export interface DailyBountySpec {
  id: string;
  title: string;
  description: string;
  target: number;
  rewardCredits: number;
  rewardXp: number;
}

const BOUNTY_POOL: DailyBountySpec[] = [
  {
    id: 'zero_lock',
    title: 'Zero Lock',
    description: 'Win 2 hands with a Sabacc (0 total)',
    target: 2,
    rewardCredits: 220,
    rewardXp: 85,
  },
  {
    id: 'specialty_hunter',
    title: 'Specialty Hunter',
    description: 'Reach Showdown with a Specialty Sabacc (Pair or higher)',
    target: 1,
    rewardCredits: 260,
    rewardXp: 105,
  },
  {
    id: 'shift_survivor',
    title: 'Shift Survivor',
    description: 'Survive 2 Sabacc Shifts to Showdown',
    target: 2,
    rewardCredits: 240,
    rewardXp: 95,
  },
  {
    id: 'sabacc_raider',
    title: 'Jackpot Raider',
    description: 'Claim the Sabacc Pot with a Specialty hand',
    target: 1,
    rewardCredits: 350,
    rewardXp: 135,
  },
  {
    id: 'nulrhek_sniper',
    title: 'Razor Nulrhek',
    description: 'Win a hand with a +1 or -1 Nulrhek',
    target: 1,
    rewardCredits: 200,
    rewardXp: 80,
  },
  {
    id: 'high_roller',
    title: 'High Roller',
    description: 'Win 80+ CR net in a single hand',
    target: 1,
    rewardCredits: 260,
    rewardXp: 100,
  },
  {
    id: 'hot_streak',
    title: 'Hot Hand',
    description: 'Win 2 consecutive hands in a row',
    target: 1,
    rewardCredits: 230,
    rewardXp: 90,
  },
  {
    id: 'table_grinder',
    title: 'Cantina Regular',
    description: 'Play 5 complete hands at any table',
    target: 5,
    rewardCredits: 180,
    rewardXp: 75,
  },
  {
    id: 'kessel_finisher',
    title: 'Kessel Sprinter',
    description: "Finish today's 5-hand Daily Kessel Run",
    target: 1,
    rewardCredits: 300,
    rewardXp: 120,
  },
];

export const DAILY_SWEEP_BONUS_CREDITS = 400;
export const DAILY_SWEEP_BONUS_XP = 150;

/** Deterministically selects 3 distinct Daily Syndicate Bounties for a UTC `YYYY-MM-DD` key. */
export function getDailyBounties(dateKey: string): DailyBountySpec[] {
  const rng = createSeededRng(`sabacc-syndicate-bounties:${dateKey}`);
  const copy = [...BOUNTY_POOL];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, 3);
}

/** Computes incremental progress ticks earned for a given bounty on a completed hand. */
export function bountyIncrementForHand(
  bountyId: string,
  state: ClientGameState,
  myPlayerId: string,
  handNetDelta: number,
  newStreak: number
): number {
  const me = state.players.find(p => p.id === myPlayerId);
  if (!me || me.isSpectator || !state.showdownResult) return 0;

  const iWon = state.winnerIds.includes(myPlayerId);
  const myStanding = state.showdownResult.standings.find(s => s.playerId === myPlayerId);
  const shifted = !!state.lastDiceRoll && state.lastDiceRoll[0] === state.lastDiceRoll[1];
  const wonSabaccPot = state.showdownResult.payouts.some(
    p => p.label === 'Sabacc Pot' && p.winnerIds.includes(myPlayerId)
  );

  switch (bountyId) {
    case 'zero_lock':
      return iWon && myStanding?.evaluation.sum === 0 ? 1 : 0;
    case 'specialty_hunter':
      return myStanding?.evaluation.isSpecialty ? 1 : 0;
    case 'shift_survivor':
      return shifted && !me.isFolded ? 1 : 0;
    case 'sabacc_raider':
      return wonSabaccPot ? 1 : 0;
    case 'nulrhek_sniper':
      return iWon && myStanding && myStanding.evaluation.absSum === 1 ? 1 : 0;
    case 'high_roller':
      return handNetDelta >= 80 ? 1 : 0;
    case 'hot_streak':
      return newStreak >= 2 ? 1 : 0;
    case 'table_grinder':
      return 1;
    case 'kessel_finisher':
      return state.daily?.finished ? 1 : 0;
    default:
      return 0;
  }
}
