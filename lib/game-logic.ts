import { Rng } from './prng';

export enum CardType {
  POSITIVE = 'POSITIVE',
  NEGATIVE = 'NEGATIVE',
  SYLOP = 'SYLOP',
}

export enum CardSuit {
  CIRCLE = 'CIRCLE', // 3 (highest)
  TRIANGLE = 'TRIANGLE', // 2
  SQUARE = 'SQUARE', // 1 (lowest)
  NONE = 'NONE',
}

export interface Card {
  id: string;
  value: number;
  type: CardType;
  suit: CardSuit;
  /** True only in redacted client payloads for face-down opponent hole cards. */
  hidden?: boolean;
}

export type HandKey =
  | 'pure_sabacc'
  | 'full_sabacc'
  | 'fleet'
  | 'yee_haa'
  | 'rhylet'
  | 'squadron'
  | 'gee_whiz'
  | 'straight_khyron'
  | 'banthas_wild'
  | 'rule_of_two'
  | 'sabacc_pair'
  | 'sabacc'
  | 'nulrhek';

export interface HandCodexEntryMeta {
  key: HandKey;
  name: string;
  formula: string;
  example: string;
  rarity: 'Mythic' | 'Legendary' | 'Epic' | 'Rare' | 'Uncommon' | 'Common';
  winsSabaccPot: boolean;
}

export const HAND_CODEX_META: HandCodexEntryMeta[] = [
  { key: 'pure_sabacc', name: 'Pure Sabacc', formula: 'Two Sylops (0 + 0)', example: '0, 0', rarity: 'Mythic', winsSabaccPot: true },
  { key: 'full_sabacc', name: 'Full Sabacc', formula: 'Sylop + four 10s summing to 0', example: '0, +10, +10, -10, -10', rarity: 'Mythic', winsSabaccPot: true },
  { key: 'fleet', name: 'Fleet', formula: 'Sylop + four of a kind summing to 0', example: '0, +5, +5, -5, -5', rarity: 'Legendary', winsSabaccPot: true },
  { key: 'yee_haa', name: 'Yee-Haa', formula: 'Sylop + pair summing to 0', example: '0, +4, -4', rarity: 'Legendary', winsSabaccPot: true },
  { key: 'rhylet', name: 'Rhylet', formula: 'Three of a kind + pair summing to 0', example: '+2, +2, +2, -3, -3', rarity: 'Epic', winsSabaccPot: true },
  { key: 'squadron', name: 'Squadron', formula: 'Four of a kind summing to 0', example: '+6, +6, -6, -6', rarity: 'Epic', winsSabaccPot: true },
  { key: 'gee_whiz', name: 'Gee Whiz', formula: '+1,+2,+3,+4,-10 or -1,-2,-3,-4,+10', example: '+1, +2, +3, +4, -10', rarity: 'Rare', winsSabaccPot: true },
  { key: 'straight_khyron', name: 'Straight Khyron', formula: 'Run of 4 sequential values summing to 0', example: '+7, -8, -9, +10', rarity: 'Rare', winsSabaccPot: true },
  { key: 'banthas_wild', name: 'Banthas Wild', formula: 'Three of a kind summing to 0', example: '+4, +4, +4, -3, -9', rarity: 'Uncommon', winsSabaccPot: true },
  { key: 'rule_of_two', name: 'Rule of Two', formula: 'Two pairs summing to 0', example: '+9, -9, +4, -4', rarity: 'Uncommon', winsSabaccPot: true },
  { key: 'sabacc_pair', name: 'Sabacc (Pair)', formula: 'One pair summing to 0', example: '+5, -5', rarity: 'Common', winsSabaccPot: true },
  { key: 'sabacc', name: 'Sabacc', formula: 'Non-paired hand summing to 0', example: '+7, -3, -4', rarity: 'Common', winsSabaccPot: false },
  { key: 'nulrhek', name: 'Nulrhek', formula: 'Any hand not summing to 0 (closest wins)', example: '+6, -5 (+1)', rarity: 'Common', winsSabaccPot: false },
];

export interface HandEvaluation {
  sum: number;
  absSum: number;
  score: number;
  scoreNoSuit: number;
  rankKey: HandKey;
  rankName: string;
  isSabacc: boolean;
  isSpecialty: boolean;
}

export type StakesTier = 'low' | 'medium' | 'high' | 'no_limit';
export type TieRule = 'split' | 'blind_draw';
export type GameMode = 'party' | 'quick_solo' | 'cantina_tour' | 'daily_kessel';
export type BotSkill = 'novice' | 'regular' | 'shark';

export interface TableSettings {
  stakesTier: StakesTier;
  ante: number;
  sabaccAnte: number;
  /** Max credits one seat can commit to the hand pot per hand. 0 = unlimited. */
  tableLimit: number;
  tieRule: TieRule;
  /** Seconds per human turn before auto-stand/check/fold. 0 = disabled. */
  turnSeconds: number;
  /** When true, seats cannot arbitrarily edit or top up credits mid-session. */
  lockedCredits: boolean;
  startingCredits: number;
}

export const STAKES_PRESETS: Record<StakesTier, Pick<TableSettings, 'ante' | 'sabaccAnte' | 'tableLimit' | 'startingCredits'>> = {
  low: { ante: 5, sabaccAnte: 2, tableLimit: 150, startingCredits: 300 },
  medium: { ante: 10, sabaccAnte: 5, tableLimit: 1000, startingCredits: 1000 },
  high: { ante: 50, sabaccAnte: 25, tableLimit: 5000, startingCredits: 5000 },
  no_limit: { ante: 25, sabaccAnte: 15, tableLimit: 0, startingCredits: 2500 },
};

export function defaultTableSettings(tier: StakesTier = 'medium'): TableSettings {
  return {
    stakesTier: tier,
    ...STAKES_PRESETS[tier],
    tieRule: 'split',
    turnSeconds: 45,
    lockedCredits: false,
  };
}

export function effectiveTableLimit(settings: TableSettings): number {
  return settings.tableLimit > 0 ? settings.tableLimit : Infinity;
}

export function spendableFor(player: { credits: number; contributed: number }, settings: TableSettings): number {
  const limit = effectiveTableLimit(settings);
  return Math.max(0, Math.min(player.credits, limit - player.contributed));
}

export interface PlayerActionBadge {
  text: string;
  tone: 'neutral' | 'card' | 'bet' | 'raise' | 'fold' | 'all_in' | 'emote' | 'quips';
  timestamp: number;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  credits: number;
  /** Total buy-in credits issued to this seat across the session, for honest net tracking. */
  buyInTotal: number;
  /** Credits contributed to the Hand Pot during the current hand (excludes Sabacc Pot ante). */
  contributed: number;
  isFolded: boolean;
  isReady: boolean;
  betThisRound: number;
  isAI?: boolean;
  botSkill?: BotSkill;
  personaId?: string;
  avatarTone?: string;
  tagline?: string;
  isSpectator?: boolean;
  isConnected?: boolean;
  lastAction?: PlayerActionBadge | null;
  /** Snapshot of `credits` immediately prior to paying antes for the current hand. */
  handStartCredits?: number;
  /** Server-only pilot identity key (never broadcast to clients). */
  pilotKey?: string;
}

export interface LedgerEntry {
  playerId: string;
  name: string;
  isAI: boolean;
  buyInTotal: number;
  credits: number;
  net: number;
  handsPlayed: number;
  handsWon: number;
  biggestPot: number;
}

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface PayoutItem {
  label: string;
  winnerIds: string[];
  winnerNames: string[];
  amount: number;
  split: boolean;
}

export interface BlindDrawRound {
  round: number;
  draws: { playerId: string; name: string; card: Card }[];
}

export interface ShowdownStanding {
  playerId: string;
  name: string;
  hand: Card[];
  evaluation: HandEvaluation;
  netDelta: number;
  isWinner: boolean;
}

export interface ShowdownResult {
  standings: ShowdownStanding[];
  payouts: PayoutItem[];
  sabaccPotCarried: boolean;
  blindDrawRounds: BlindDrawRound[];
  netByPlayer?: Record<string, number>;
}

export interface DailyHandStamp {
  handNumber: number;
  delta: number;
  rankName: string;
  rankKey: HandKey;
  shifted: boolean;
  won: boolean;
}

export interface TourProgressState {
  stageIndex: number; // 0..4
  venueName: string;
  venueSubtitle: string;
  targetCredits: number;
  stageCleared: boolean;
  tourCompleted: boolean;
  runFailed: boolean;
}

export interface DailyRunState {
  dateKey: string;
  maxHands: number;
  handsCompleted: number;
  history: DailyHandStamp[];
  finished: boolean;
  startingCredits: number;
}

export interface PublicRoomSummary {
  roomId: string;
  hostName: string;
  stakesTier: StakesTier;
  ante: number;
  sabaccAnte: number;
  seatedCount: number;
  maxPlayers: number;
  spectatorCount: number;
  currentPhase: 'JOINING' | 'CARD' | 'BETTING' | 'DICE' | 'SHOWDOWN';
  currentRound: number;
}

export interface LeaderboardEntry {
  idHash: string;
  callsign: string;
  careerNet: number;
  handsPlayed: number;
  handsWon: number;
  sabaccPotsWon: number;
  biggestPot: number;
  bestStreak: number;
  cantinaTitles: number;
  recentNetCurve: number[];
  updatedAt: number;
}

export interface DailyLeaderEntry {
  idHash: string;
  callsign: string;
  finalCredits: number;
  net: number;
}

export interface LobbySnapshot {
  rooms: PublicRoomSummary[];
  pilotsOnline: number;
  serverNotice: string;
  discordShareEnabled: boolean;
  leaderboard?: LeaderboardEntry[];
  dailyLeaderboard?: DailyLeaderEntry[];
}

export interface GameState {
  roomId: string;
  hostId: string | null;
  isPublic?: boolean;
  mode: GameMode;
  settings: TableSettings;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  handPot: number;
  sabaccPot: number;
  currentRound: number; // 1, 2, 3
  gamesPlayed: number;
  currentPhase: 'JOINING' | 'CARD' | 'BETTING' | 'DICE' | 'SHOWDOWN';
  turnIndex: number;
  dealerIndex: number;
  currentBet: number;
  minRaise: number;
  bettingLapComplete?: boolean;
  turnExpires: number | null;
  lastDiceRoll: [number, number] | null;
  /** True while dice are tumbling before Sabacc Shift redeal executes. */
  shiftPending?: boolean;
  /** True right after Sabacc Shift sweeps and redeals hands. */
  shiftTriggered?: boolean;
  winnerId: string | null;
  winnerIds: string[];
  showdownResult: ShowdownResult | null;
  ledger: Record<string, LedgerEntry>;
  tour?: TourProgressState | null;
  daily?: DailyRunState | null;
  logs: string[];
  messages: ChatMessage[];
}

/** Client-safe view of GameState with `deck` removed and opponent hole cards masked until SHOWDOWN. */
export interface ClientGameState extends Omit<GameState, 'deck'> {
  deckCount: number;
}

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  let id = 0;
  const suits = [CardSuit.CIRCLE, CardSuit.TRIANGLE, CardSuit.SQUARE];

  for (let v = 1; v <= 10; v++) {
    for (const suit of suits) {
      deck.push({ id: `c-${id++}`, value: v, type: CardType.POSITIVE, suit });
    }
  }

  for (let v = 1; v <= 10; v++) {
    for (const suit of suits) {
      deck.push({ id: `c-${id++}`, value: -v, type: CardType.NEGATIVE, suit });
    }
  }

  deck.push({ id: `c-${id++}`, value: 0, type: CardType.SYLOP, suit: CardSuit.NONE });
  deck.push({ id: `c-${id++}`, value: 0, type: CardType.SYLOP, suit: CardSuit.NONE });

  return deck;
};

export const shuffle = <T>(array: T[], rng: Rng = Math.random): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

/**
 * Draws one card from the shoe. If exhausted, reshuffles the discard pile
 * underneath the face-up top discard so held cards are never duplicated.
 */
export function drawFromShoe(
  state: { deck: Card[]; discardPile: Card[]; logs: string[] },
  rng: Rng = Math.random
): Card {
  if (state.deck.length === 0) {
    const top = state.discardPile.pop();
    if (state.discardPile.length > 0) {
      state.deck = shuffle(state.discardPile, rng);
      state.discardPile = top ? [top] : [];
      state.logs.push('Discard pile reshuffled into the draw shoe.');
    } else {
      if (top) state.discardPile = [top];
      state.deck = shuffle(createDeck(), rng);
      state.logs.push('Auxiliary shoe loaded.');
    }
  }
  return state.deck.pop()!;
}

const getCounts = (hand: Card[]): Record<number, number> => {
  const counts: Record<number, number> = {};
  for (const c of hand) {
    const absVal = Math.abs(c.value);
    counts[absVal] = (counts[absVal] || 0) + 1;
  }
  return counts;
};

const pairValuesAsc = (counts: Record<number, number>, minCount = 2): number[] =>
  Object.entries(counts)
    .filter(([, count]) => count >= minCount)
    .map(([val]) => Number(val))
    .sort((a, b) => a - b);

const findLowestStraightStart = (hand: Card[], length: number): number | null => {
  const values = Array.from(new Set(hand.map(c => Math.abs(c.value)))).sort((a, b) => a - b);
  if (values.length < length) return null;
  let run = 1;
  for (let i = 1; i < values.length; i++) {
    if (values[i] === values[i - 1] + 1) {
      run++;
      if (run >= length) return values[i - length + 1];
    } else {
      run = 1;
    }
  }
  return null;
};

const isGeeWhiz = (nonSylops: Card[]): boolean => {
  if (nonSylops.length !== 5) return false;
  const vals = nonSylops.map(c => c.value).sort((a, b) => a - b);
  const set1 = [-10, 1, 2, 3, 4];
  const set2 = [-4, -3, -2, -1, 10];
  return set1.every((v, i) => vals[i] === v) || set2.every((v, i) => vals[i] === v);
};

const suitRank = (suit: CardSuit): number => {
  if (suit === CardSuit.CIRCLE) return 3;
  if (suit === CardSuit.TRIANGLE) return 2;
  if (suit === CardSuit.SQUARE) return 1;
  return 0;
};

/**
 * Evaluates a Corellian Spike hand with non-overlapping positional scoring:
 *  - Primary:   rankScore * 1e9 (Pure Sabacc 1000 down to Nulrhek 0)
 *  - Secondary:
 *      * Specialty Sabacc: lower primary integer wins ties ((11 - v) * 1e6)
 *      * Nulrhek:          closer to 0 ((100 - absSum) * 1e6) + positive beats negative (+5e5)
 *  - Tertiary:  mostCards * 2000 + positiveSum * 20 + highestPositiveCard (or leastNegativeCard * 0.5)
 *  - Suit:      highestSuit * 0.1
 */
export const evaluateHand = (hand: Card[]): HandEvaluation => {
  const visibleHand = hand.filter(c => !c.hidden);
  if (visibleHand.length === 0) {
    return {
      sum: 0,
      absSum: 0,
      score: 0,
      scoreNoSuit: 0,
      rankKey: 'nulrhek',
      rankName: 'Hidden',
      isSabacc: false,
      isSpecialty: false,
    };
  }

  const sum = visibleHand.reduce((acc, card) => acc + card.value, 0);
  const absSum = Math.abs(sum);
  const sylopCount = visibleHand.filter(c => c.type === CardType.SYLOP).length;
  const nonSylops = visibleHand.filter(c => c.type !== CardType.SYLOP);
  const counts = getCounts(nonSylops);

  const quads = pairValuesAsc(counts, 4);
  const trips = pairValuesAsc(counts, 3);
  const pairs = pairValuesAsc(counts, 2);
  const straightStart = findLowestStraightStart(nonSylops, 4);

  let rankScore = 0;
  let secondaryScore = 0;
  let rankKey: HandKey = 'nulrhek';
  let rankName = '';

  if (sum === 0) {
    if (sylopCount === 2) {
      rankScore = 1000;
      rankKey = 'pure_sabacc';
      rankName = 'Pure Sabacc';
    } else if (sylopCount === 1 && counts[10] === 4) {
      rankScore = 900;
      rankKey = 'full_sabacc';
      rankName = 'Full Sabacc';
    } else if (sylopCount === 1 && quads.length > 0) {
      rankScore = 800;
      secondaryScore = (11 - quads[0]) * 1_000_000;
      rankKey = 'fleet';
      rankName = 'Fleet';
    } else if (sylopCount === 1 && pairs.length >= 1) {
      rankScore = 700;
      secondaryScore = (11 - pairs[0]) * 1_000_000;
      rankKey = 'yee_haa';
      rankName = 'Yee-Haa';
    } else if (trips.length > 0 && pairs.length >= 2) {
      const pairOther = pairs.find(v => v !== trips[0]) ?? pairs[0];
      rankScore = 600;
      secondaryScore = (11 - trips[0]) * 1_000_000 + (11 - pairOther) * 40_000;
      rankKey = 'rhylet';
      rankName = 'Rhylet';
    } else if (quads.length > 0) {
      rankScore = 500;
      secondaryScore = (11 - quads[0]) * 1_000_000;
      rankKey = 'squadron';
      rankName = 'Squadron';
    } else if (isGeeWhiz(nonSylops)) {
      rankScore = 450;
      rankKey = 'gee_whiz';
      rankName = 'Gee Whiz';
    } else if (straightStart !== null) {
      rankScore = 400;
      secondaryScore = (11 - straightStart) * 1_000_000;
      rankKey = 'straight_khyron';
      rankName = 'Straight Khyron';
    } else if (trips.length > 0) {
      rankScore = 200;
      secondaryScore = (11 - trips[0]) * 1_000_000;
      rankKey = 'banthas_wild';
      rankName = 'Banthas Wild';
    } else if (pairs.length >= 2) {
      rankScore = 100;
      secondaryScore = (11 - pairs[0]) * 1_000_000 + (11 - pairs[1]) * 40_000;
      rankKey = 'rule_of_two';
      rankName = 'Rule of Two';
    } else if (pairs.length >= 1) {
      rankScore = 50;
      secondaryScore = (11 - pairs[0]) * 1_000_000;
      rankKey = 'sabacc_pair';
      rankName = 'Sabacc (Pair)';
    } else {
      rankScore = 10;
      rankKey = 'sabacc';
      rankName = 'Sabacc';
    }
  } else {
    rankScore = 0;
    secondaryScore = (100 - absSum) * 1_000_000 + (sum > 0 ? 500_000 : 0);
    rankKey = 'nulrhek';
    rankName = `Nulrhek (${sum > 0 ? `+${sum}` : sum})`;
  }

  const mostCards = visibleHand.length;
  const positives = visibleHand.filter(c => c.value > 0);
  const negatives = visibleHand.filter(c => c.value < 0);
  const positiveSum = positives.reduce((acc, c) => acc + c.value, 0);
  const highestPositiveCard = positives.length > 0 ? Math.max(...positives.map(c => c.value)) : 0;

  let suitBonus = 0;
  let allNegativeTieBreak = 0;
  if (positives.length > 0) {
    const bestSuit = Math.max(...positives.filter(c => c.value === highestPositiveCard).map(c => suitRank(c.suit)));
    suitBonus = bestSuit * 0.1;
  } else if (negatives.length > 0) {
    // All-negative hand: single negative closest to zero (-1 beats -10), then its suit.
    const closestNeg = Math.max(...negatives.map(c => c.value)); // e.g. -1 > -5
    allNegativeTieBreak = (11 + closestNeg) * 0.5; // 0.5..5.0 (strictly < 20)
    const bestSuit = Math.max(...negatives.filter(c => c.value === closestNeg).map(c => suitRank(c.suit)));
    suitBonus = bestSuit * 0.1;
  }

  const scoreNoSuit =
    rankScore * 1_000_000_000 +
    secondaryScore +
    mostCards * 2_000 +
    positiveSum * 20 +
    highestPositiveCard +
    allNegativeTieBreak;

  const score = scoreNoSuit + suitBonus;

  return {
    sum,
    absSum,
    score,
    scoreNoSuit,
    rankKey,
    rankName,
    isSabacc: rankScore >= 10,
    isSpecialty: rankScore >= 50,
  };
};

/** Previews the exact hand evaluation if `swapOutId` is replaced by `replacement`. */
export function previewSwap(hand: Card[], swapOutId: string, replacement: Card): HandEvaluation | null {
  const idx = hand.findIndex(c => c.id === swapOutId);
  if (idx === -1) return null;
  const next = [...hand];
  next[idx] = replacement;
  return evaluateHand(next);
}

export interface ZeroLockHint {
  label: string;
  liveOuts: number;
  unseenTotal: number;
}

/**
 * Pure public-info card counter: computes live unseen cards in the 62-card Corellian Spike
 * shoe that immediately lock a `0` Sabacc by either Drawing or Swapping a selected card.
 */
export function analyzeZeroOuts(
  hand: Card[],
  topDiscard: Card | null,
  selectedCardId?: string | null
): ZeroLockHint | null {
  const visible = hand.filter(c => !c.hidden);
  if (visible.length === 0) return null;

  // Build full 62-card frequency map: 2 Sylops (0), 3 copies of each +1..+10 and -1..-10
  const counts = new Map<number, number>();
  counts.set(0, 2);
  for (let v = 1; v <= 10; v++) {
    counts.set(v, 3);
    counts.set(-v, 3);
  }

  let knownCount = 0;
  for (const c of visible) {
    counts.set(c.value, Math.max(0, (counts.get(c.value) ?? 0) - 1));
    knownCount++;
  }
  if (topDiscard && !topDiscard.hidden) {
    counts.set(topDiscard.value, Math.max(0, (counts.get(topDiscard.value) ?? 0) - 1));
    knownCount++;
  }
  const unseenTotal = Math.max(1, 62 - knownCount);
  const currentSum = visible.reduce((s, c) => s + c.value, 0);

  // If a specific card is selected for swapping, show exact outs to hit 0 by swapping that card!
  if (selectedCardId) {
    const sel = visible.find(c => c.id === selectedCardId);
    if (sel) {
      const restSum = currentSum - sel.value;
      const needed = -restSum;
      if (needed >= -10 && needed <= 10) {
        const outs = counts.get(needed) ?? 0;
        const fmt = needed > 0 ? `+${needed}` : `${needed}`;
        return {
          label: `SWAP FOR ${fmt} → SABACC`,
          liveOuts: outs,
          unseenTotal,
        };
      }
    }
  }

  if (currentSum === 0) {
    const sylopOuts = counts.get(0) ?? 0;
    return {
      label: 'ZERO LOCKED',
      liveOuts: sylopOuts,
      unseenTotal,
    };
  }

  // Otherwise check if a single Draw (-10..+10) hits 0 directly:
  const drawNeeded = -currentSum;
  if (visible.length < 6 && drawNeeded >= -10 && drawNeeded <= 10) {
    const outs = counts.get(drawNeeded) ?? 0;
    const fmt = drawNeeded > 0 ? `+${drawNeeded}` : `${drawNeeded}`;
    return {
      label: `DRAW ${fmt} → SABACC`,
      liveOuts: outs,
      unseenTotal,
    };
  }

  // Or find best single-card shoe swap that hits 0:
  let bestCard: Card | null = null;
  let bestNeeded = 0;
  let bestOuts = -1;
  for (const c of visible) {
    const needed = -(currentSum - c.value);
    if (needed >= -10 && needed <= 10) {
      const outs = counts.get(needed) ?? 0;
      if (outs > bestOuts) {
        bestOuts = outs;
        bestNeeded = needed;
        bestCard = c;
      }
    }
  }
  if (bestCard && bestOuts > 0) {
    const dropFmt = bestCard.value > 0 ? `+${bestCard.value}` : `${bestCard.value}`;
    const needFmt = bestNeeded > 0 ? `+${bestNeeded}` : `${bestNeeded}`;
    return {
      label: `SWAP ${dropFmt} FOR ${needFmt}`,
      liveOuts: bestOuts,
      unseenTotal,
    };
  }

  return null;
}
