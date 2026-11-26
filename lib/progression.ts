import {
  bountyIncrementForHand,
  DAILY_SWEEP_BONUS_CREDITS,
  DAILY_SWEEP_BONUS_XP,
  getDailyBounties,
  getRepProgress,
} from './bounties';
import { ClientGameState, GameMode, HandKey } from './game-logic';

export type FeltThemeId =
  | 'cantina-brass'
  | 'tatooine-sand'
  | 'corellian-teal'
  | 'vandor-frost'
  | 'bespin-gold'
  | 'canto-obsidian';

export type CardBackId =
  | 'spike-classic'
  | 'worn-copper'
  | 'beskar-steel'
  | 'crimson-dawn'
  | 'halcyon-holo';

export type DiceStyleId = 'brass-aurebesh' | 'tibanna-amber' | 'obsidian-gold';
export type ColorMode = 'dark' | 'light';

export interface CreditHistoryPoint {
  ts: number;
  vault: number;
  careerNet: number;
  delta: number;
  mode: GameMode;
  rankName: string;
}

export interface DailyNetRecord {
  net: number;
  hands: number;
  wins: number;
}

export interface DailyBountyState {
  progress: Record<string, number>;
  completedIds: string[];
  sweepClaimed: boolean;
}

export interface RivalRecord {
  name: string;
  hands: number;
  winsAgainst: number;
  lossesTo: number;
}

export interface PilotDossier {
  pilotKey: string;
  callsign: string;
  /** Spendable persistent Smuggler Vault bankroll carried across Quick Solo sessions & bounties. */
  vaultCredits: number;
  /** Honest cumulative pot P&L across every hand ever played (unaffected by free bailouts/stipends). */
  careerNetCredits: number;
  peakVaultCredits: number;
  bailoutsCount: number;
  repXp: number;
  loginStreak: number;
  bestLoginStreak: number;
  lastStipendDate: string;
  handsPlayed: number;
  handsWon: number;
  sabaccPotsWon: number;
  shiftsSurvived: number;
  biggestPotWon: number;
  currentStreak: number;
  bestStreak: number;
  cantinaHighestStage: number; // 0 = none cleared yet, 1..5 = stages cleared
  cantinaTitlesWon: number;
  codex: Partial<Record<HandKey, { count: number; firstAt: number }>>;
  dailyBestByDate: Record<string, { finalCredits: number; net: number; shareText: string }>;
  /** Rolling 120-hand bankroll & net credit trajectory over time. */
  creditHistory: CreditHistoryPoint[];
  /** Rolling 30-day calendar net credit summary (`YYYY-MM-DD`). */
  dailyNetByDate: Record<string, DailyNetRecord>;
  /** Daily Syndicate Bounty completion & progress keyed by UTC `YYYY-MM-DD`. */
  bountiesByDate: Record<string, DailyBountyState>;
  /** Rival nemesis ledger tracking head-to-head results vs personas & humans. */
  rivals: Record<string, RivalRecord>;
  selectedFelt: FeltThemeId;
  selectedCardBack: CardBackId;
  selectedDice: DiceStyleId;
  colorMode: ColorMode;
  volume: number;
  ambientHum: boolean;
  haptics: boolean;
  chatEnabled: boolean;
  tutorialCompleted: boolean;
  lastRecordedHandId?: string;
}

const STORAGE_KEY = 'sabacc:pilotDossier:v1';
const MAX_HISTORY_POINTS = 120;
const MAX_DAILY_NET_DAYS = 30;
const BAILOUT_THRESHOLD = 60;
const BAILOUT_GRANT_TO = 300;

function generatePilotKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `pk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function defaultDossier(): PilotDossier {
  return {
    pilotKey: '',
    callsign: '',
    vaultCredits: 1000,
    careerNetCredits: 0,
    peakVaultCredits: 1000,
    bailoutsCount: 0,
    repXp: 0,
    loginStreak: 0,
    bestLoginStreak: 0,
    lastStipendDate: '',
    handsPlayed: 0,
    handsWon: 0,
    sabaccPotsWon: 0,
    shiftsSurvived: 0,
    biggestPotWon: 0,
    currentStreak: 0,
    bestStreak: 0,
    cantinaHighestStage: 0,
    cantinaTitlesWon: 0,
    codex: {},
    dailyBestByDate: {},
    creditHistory: [],
    dailyNetByDate: {},
    bountiesByDate: {},
    rivals: {},
    selectedFelt: 'cantina-brass',
    selectedCardBack: 'spike-classic',
    selectedDice: 'brass-aurebesh',
    colorMode: 'dark',
    volume: 0.8,
    ambientHum: false,
    haptics: true,
    chatEnabled: true,
    tutorialCompleted: false,
  };
}

export function loadDossier(): PilotDossier {
  if (typeof window === 'undefined') return defaultDossier();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<PilotDossier>) : {};
    const merged: PilotDossier = {
      ...defaultDossier(),
      ...parsed,
      creditHistory: Array.isArray(parsed.creditHistory) ? parsed.creditHistory : [],
      dailyNetByDate: parsed.dailyNetByDate ?? {},
      bountiesByDate: parsed.bountiesByDate ?? {},
      rivals: parsed.rivals ?? {},
    };
    if (!merged.pilotKey) {
      merged.pilotKey = generatePilotKey();
      saveDossier(merged);
    }
    return merged;
  } catch {
    const fresh = defaultDossier();
    fresh.pilotKey = generatePilotKey();
    return fresh;
  }
}

export function saveDossier(dossier: PilotDossier): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dossier));
  } catch {
    // Ignore storage quota errors.
  }
}

export function eraseLocalDossier(): PilotDossier {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.sessionStorage.clear();
    } catch {
      // Ignore storage errors.
    }
  }
  const fresh = defaultDossier();
  fresh.pilotKey = generatePilotKey();
  saveDossier(fresh);
  return fresh;
}

function previousUtcDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export interface StipendClaimResult {
  dossier: PilotDossier;
  claimed: boolean;
  rewardCredits: number;
  rewardXp: number;
  streak: number;
}

/** Claims the once-per-UTC-day Syndicate Login Stipend and advances the daily streak. */
export function claimDailyStipend(prev: PilotDossier, todayKey: string): StipendClaimResult {
  if (!todayKey || prev.lastStipendDate === todayKey) {
    return { dossier: prev, claimed: false, rewardCredits: 0, rewardXp: 0, streak: prev.loginStreak };
  }

  const isConsecutive = prev.lastStipendDate === previousUtcDateKey(todayKey);
  const streak = isConsecutive ? prev.loginStreak + 1 : 1;
  const rewardCredits = Math.min(500, 150 + (streak - 1) * 50);
  const rewardXp = 40;
  const nextVault = prev.vaultCredits + rewardCredits;

  const next: PilotDossier = {
    ...prev,
    vaultCredits: nextVault,
    peakVaultCredits: Math.max(prev.peakVaultCredits, nextVault),
    repXp: prev.repXp + rewardXp,
    loginStreak: streak,
    bestLoginStreak: Math.max(prev.bestLoginStreak, streak),
    lastStipendDate: todayKey,
  };

  return {
    dossier: next,
    claimed: true,
    rewardCredits,
    rewardXp,
    streak,
  };
}

export interface FeltThemeSpec {
  id: FeltThemeId;
  name: string;
  railClass: string;
  feltStyle: string;
  glowColor: string;
  unlockRequirement: string;
  isUnlocked: (d: PilotDossier) => boolean;
}

export const FELT_THEMES: FeltThemeSpec[] = [
  {
    id: 'cantina-brass',
    name: 'Outer Rim Brass',
    railClass: 'border-amber-700/60 shadow-[0_0_70px_rgba(217,119,6,0.16),inset_0_0_80px_rgba(0,0,0,0.85)]',
    feltStyle: 'radial-gradient(ellipse at center, #261b10 0%, #120d08 62%, #090705 100%)',
    glowColor: 'rgba(245, 158, 11, 0.14)',
    unlockRequirement: 'Standard Issue',
    isUnlocked: () => true,
  },
  {
    id: 'tatooine-sand',
    name: 'Mos Eisley Dune',
    railClass: 'border-orange-600/55 shadow-[0_0_70px_rgba(234,88,12,0.16),inset_0_0_80px_rgba(0,0,0,0.85)]',
    feltStyle: 'radial-gradient(ellipse at center, #2f1c12 0%, #190e09 62%, #0b0604 100%)',
    glowColor: 'rgba(249, 115, 22, 0.14)',
    unlockRequirement: 'Clear Mos Eisley OR play 5 hands',
    isUnlocked: d => d.cantinaHighestStage >= 1 || d.handsPlayed >= 5,
  },
  {
    id: 'corellian-teal',
    name: 'Corellian Shipyard',
    railClass: 'border-teal-500/50 shadow-[0_0_70px_rgba(20,184,166,0.16),inset_0_0_80px_rgba(0,0,0,0.85)]',
    feltStyle: 'radial-gradient(ellipse at center, #0d292a 0%, #071619 62%, #040b0d 100%)',
    glowColor: 'rgba(45, 212, 191, 0.14)',
    unlockRequirement: 'Clear Coronet Den OR discover 4 Codex hands',
    isUnlocked: d => d.cantinaHighestStage >= 2 || Object.keys(d.codex).length >= 4,
  },
  {
    id: 'vandor-frost',
    name: 'Vandor Lodge Slate',
    railClass: 'border-sky-400/45 shadow-[0_0_70px_rgba(56,189,248,0.15),inset_0_0_80px_rgba(0,0,0,0.85)]',
    feltStyle: 'radial-gradient(ellipse at center, #142233 0%, #0b131e 62%, #05080e 100%)',
    glowColor: 'rgba(56, 189, 248, 0.14)',
    unlockRequirement: 'Clear Fort Ypso OR win 10 hands',
    isUnlocked: d => d.cantinaHighestStage >= 3 || d.handsWon >= 10,
  },
  {
    id: 'bespin-gold',
    name: 'Cloud City Suite',
    railClass: 'border-yellow-400/60 shadow-[0_0_80px_rgba(250,204,21,0.18),inset_0_0_80px_rgba(0,0,0,0.85)]',
    feltStyle: 'radial-gradient(ellipse at center, #2c2310 0%, #171208 62%, #090704 100%)',
    glowColor: 'rgba(250, 204, 21, 0.16)',
    unlockRequirement: 'Clear Cloud City OR claim 3 Sabacc Pots',
    isUnlocked: d => d.cantinaHighestStage >= 4 || d.sabaccPotsWon >= 3,
  },
  {
    id: 'canto-obsidian',
    name: 'Canto Bight Vault',
    railClass: 'border-fuchsia-400/55 shadow-[0_0_85px_rgba(217,70,239,0.18),inset_0_0_85px_rgba(0,0,0,0.9)]',
    feltStyle: 'radial-gradient(ellipse at center, #24102c 0%, #110817 62%, #060309 100%)',
    glowColor: 'rgba(232, 121, 249, 0.15)',
    unlockRequirement: 'Win Cantina Tour OR discover 8 Codex hands',
    isUnlocked: d => d.cantinaTitlesWon >= 1 || Object.keys(d.codex).length >= 8,
  },
];

export interface CardBackSpec {
  id: CardBackId;
  name: string;
  unlockRequirement: string;
  isUnlocked: (d: PilotDossier) => boolean;
}

export const CARD_BACKS: CardBackSpec[] = [
  { id: 'spike-classic', name: 'Corellian Brass', unlockRequirement: 'Standard Issue', isUnlocked: () => true },
  {
    id: 'worn-copper',
    name: 'Smuggler Copper',
    unlockRequirement: 'Clear Mos Eisley OR play 5 hands',
    isUnlocked: d => d.cantinaHighestStage >= 1 || d.handsPlayed >= 5,
  },
  {
    id: 'beskar-steel',
    name: 'Beskar Damascus',
    unlockRequirement: 'Clear Coronet Den OR discover 4 Codex hands',
    isUnlocked: d => d.cantinaHighestStage >= 2 || Object.keys(d.codex).length >= 4,
  },
  {
    id: 'crimson-dawn',
    name: 'Crimson Syndicate',
    unlockRequirement: 'Clear Fort Ypso OR win 10 hands',
    isUnlocked: d => d.cantinaHighestStage >= 3 || d.handsWon >= 10,
  },
  {
    id: 'halcyon-holo',
    name: 'Halcyon Starlight',
    unlockRequirement: 'Win Cantina Tour OR hit a Legendary/Mythic Sabacc',
    isUnlocked: d =>
      d.cantinaTitlesWon >= 1 ||
      !!(d.codex.pure_sabacc || d.codex.full_sabacc || d.codex.fleet || d.codex.yee_haa),
  },
];

export interface DiceStyleSpec {
  id: DiceStyleId;
  name: string;
  unlockRequirement: string;
  isUnlocked: (d: PilotDossier) => boolean;
}

export const DICE_STYLES: DiceStyleSpec[] = [
  { id: 'brass-aurebesh', name: 'Smuggler Gold', unlockRequirement: 'Standard Issue', isUnlocked: () => true },
  {
    id: 'tibanna-amber',
    name: 'Tibanna Blaze',
    unlockRequirement: 'Clear Cloud City OR survive 5 Sabacc Shifts',
    isUnlocked: d => d.cantinaHighestStage >= 4 || d.shiftsSurvived >= 5,
  },
  {
    id: 'obsidian-gold',
    name: 'Canto Obsidian',
    unlockRequirement: 'Win Cantina Tour OR win 5 hands in a row',
    isUnlocked: d => d.cantinaTitlesWon >= 1 || d.bestStreak >= 5,
  },
];

export interface ShowdownSettlementOutcome {
  dossier: PilotDossier;
  changed: boolean;
  handDelta: number;
  bountiesCleared: string[];
  sweepCleared: boolean;
  rankedUpTo: string | null;
  bailoutGranted: boolean;
}

/**
 * Settles a completed hand into `PilotDossier`:
 * - Records honest `careerNetCredits`, `vaultCredits`, 120-hand `creditHistory`, and 30-day `dailyNetByDate`
 * - Updates Daily Syndicate Bounties, Reputation XP/Ranks, 13-Hand Codex, and Rival ledger
 * - Grants automatic Hutt Bailout to 300 CR if Vault falls under 60 CR so solo play never dead-ends
 */
export function settleShowdownToDossier(
  prev: PilotDossier,
  state: ClientGameState,
  myPlayerId: string | null,
  todayKey: string,
  shareTextBuilder?: () => string
): ShowdownSettlementOutcome {
  const noop: ShowdownSettlementOutcome = {
    dossier: prev,
    changed: false,
    handDelta: 0,
    bountiesCleared: [],
    sweepCleared: false,
    rankedUpTo: null,
    bailoutGranted: false,
  };

  if (!myPlayerId || state.currentPhase !== 'SHOWDOWN' || !state.showdownResult) return noop;
  const handUid = `${state.roomId}:${state.gamesPlayed}`;
  if (prev.lastRecordedHandId === handUid) return noop;

  const me = state.players.find(p => p.id === myPlayerId);
  if (!me || me.isSpectator) return noop;

  const prevRank = getRepProgress(prev.repXp);

  const next: PilotDossier = {
    ...prev,
    codex: { ...prev.codex },
    dailyBestByDate: { ...prev.dailyBestByDate },
    creditHistory: [...prev.creditHistory],
    dailyNetByDate: { ...prev.dailyNetByDate },
    bountiesByDate: { ...prev.bountiesByDate },
    rivals: { ...prev.rivals },
    lastRecordedHandId: handUid,
    handsPlayed: prev.handsPlayed + 1,
  };

  const iWon = state.winnerIds.includes(myPlayerId);
  if (iWon) {
    next.handsWon += 1;
    next.currentStreak += 1;
    if (next.currentStreak > next.bestStreak) next.bestStreak = next.currentStreak;
  } else {
    next.currentStreak = 0;
  }

  if (state.lastDiceRoll && state.lastDiceRoll[0] === state.lastDiceRoll[1] && !me.isFolded) {
    next.shiftsSurvived += 1;
  }

  let potWonByMe = 0;
  let wonSabaccPot = false;
  for (const pay of state.showdownResult.payouts) {
    if (pay.winnerIds.includes(myPlayerId)) {
      potWonByMe += Math.floor(pay.amount / Math.max(1, pay.winnerIds.length));
      if (pay.label === 'Sabacc Pot') {
        next.sabaccPotsWon += 1;
        wonSabaccPot = true;
      }
    }
  }
  if (potWonByMe > next.biggestPotWon) next.biggestPotWon = potWonByMe;

  const myStanding = state.showdownResult.standings.find(s => s.playerId === myPlayerId);
  const exactDelta =
    state.showdownResult.netByPlayer?.[myPlayerId] ??
    (myStanding ? myStanding.netDelta - state.settings.sabaccAnte : -(state.settings.ante + state.settings.sabaccAnte));

  // Record hand rank into 13-Hand Codex
  if (myStanding) {
    const key = myStanding.evaluation.rankKey;
    const prevEntry = next.codex[key];
    next.codex[key] = {
      count: (prevEntry?.count ?? 0) + 1,
      firstAt: prevEntry?.firstAt ?? Date.now(),
    };
  }

  // Record Rival head-to-head stats
  for (const opp of state.players) {
    if (opp.id === myPlayerId || opp.isSpectator) continue;
    const rKey = opp.personaId || opp.name.toLowerCase();
    const rec: RivalRecord = next.rivals[rKey]
      ? { ...next.rivals[rKey] }
      : { name: opp.name, hands: 0, winsAgainst: 0, lossesTo: 0 };
    rec.name = opp.name;
    rec.hands += 1;
    if (iWon && !state.winnerIds.includes(opp.id)) rec.winsAgainst += 1;
    else if (!iWon && state.winnerIds.includes(opp.id)) rec.lossesTo += 1;
    next.rivals[rKey] = rec;
  }

  // Base Reputation XP earned for playing & winning
  let earnedXp = 15 + (iWon ? 25 : 0) + (myStanding?.evaluation.isSpecialty ? 35 : 0) + (wonSabaccPot ? 40 : 0);

  // Cantina Tour milestones
  if (state.tour?.stageCleared) {
    const clearedLevel = state.tour.stageIndex + 1;
    if (clearedLevel > next.cantinaHighestStage) {
      next.cantinaHighestStage = clearedLevel;
      earnedXp += 90;
    }
    if (state.tour.tourCompleted) {
      next.cantinaTitlesWon += 1;
      earnedXp += 250;
    }
  }

  // Daily Kessel Run record
  if (state.daily?.finished && shareTextBuilder) {
    const dateKey = state.daily.dateKey;
    const existing = next.dailyBestByDate[dateKey];
    if (!existing || me.credits > existing.finalCredits) {
      next.dailyBestByDate[dateKey] = {
        finalCredits: me.credits,
        net: me.credits - state.daily.startingCredits,
        shareText: shareTextBuilder(),
      };
    }
  }

  // Evaluate Today's 3 Syndicate Bounties
  let bountyBonusCr = 0;
  const bountiesCleared: string[] = [];
  let sweepCleared = false;

  if (todayKey) {
    const specs = getDailyBounties(todayKey);
    const dayState: DailyBountyState = next.bountiesByDate[todayKey]
      ? {
          progress: { ...next.bountiesByDate[todayKey].progress },
          completedIds: [...next.bountiesByDate[todayKey].completedIds],
          sweepClaimed: next.bountiesByDate[todayKey].sweepClaimed,
        }
      : { progress: {}, completedIds: [], sweepClaimed: false };

    for (const b of specs) {
      const inc = bountyIncrementForHand(b.id, state, myPlayerId, exactDelta, next.currentStreak);
      if (inc <= 0) continue;
      const updatedVal = Math.min(b.target, (dayState.progress[b.id] ?? 0) + inc);
      dayState.progress[b.id] = updatedVal;
      if (updatedVal >= b.target && !dayState.completedIds.includes(b.id)) {
        dayState.completedIds.push(b.id);
        bountyBonusCr += b.rewardCredits;
        earnedXp += b.rewardXp;
        bountiesCleared.push(`${b.title} (+${b.rewardCredits} CR)`);
      }
    }

    if (specs.every(s => dayState.completedIds.includes(s.id)) && !dayState.sweepClaimed) {
      dayState.sweepClaimed = true;
      bountyBonusCr += DAILY_SWEEP_BONUS_CREDITS;
      earnedXp += DAILY_SWEEP_BONUS_XP;
      sweepCleared = true;
    }

    next.bountiesByDate[todayKey] = dayState;
    const bKeys = Object.keys(next.bountiesByDate).sort();
    if (bKeys.length > 14) {
      for (const k of bKeys.slice(0, bKeys.length - 14)) delete next.bountiesByDate[k];
    }
  }

  // Settle Honest Career Net + Vault Credits
  next.careerNetCredits = prev.careerNetCredits + exactDelta;

  // In Quick Solo, table stack IS the player's live Vault; in fixed-stack challenge/party modes,
  // positive/negative net deltas settle into the Vault alongside bounty rewards!
  let updatedVault =
    state.mode === 'quick_solo'
      ? Math.max(0, me.credits + bountyBonusCr)
      : Math.max(0, prev.vaultCredits + exactDelta + bountyBonusCr);

  let bailoutGranted = false;
  if (updatedVault < BAILOUT_THRESHOLD) {
    updatedVault = BAILOUT_GRANT_TO;
    next.bailoutsCount = prev.bailoutsCount + 1;
    bailoutGranted = true;
  }

  next.vaultCredits = updatedVault;
  next.peakVaultCredits = Math.max(prev.peakVaultCredits, updatedVault);
  next.repXp = prev.repXp + earnedXp;

  // Append time-series Credit History point
  next.creditHistory.push({
    ts: Date.now(),
    vault: next.vaultCredits,
    careerNet: next.careerNetCredits,
    delta: exactDelta,
    mode: state.mode,
    rankName: myStanding ? myStanding.evaluation.rankName : 'Folded',
  });
  if (next.creditHistory.length > MAX_HISTORY_POINTS) {
    next.creditHistory = next.creditHistory.slice(-MAX_HISTORY_POINTS);
  }

  // Record 30-day calendar net summary
  if (todayKey) {
    const dayRec = next.dailyNetByDate[todayKey] ?? { net: 0, hands: 0, wins: 0 };
    next.dailyNetByDate[todayKey] = {
      net: dayRec.net + exactDelta,
      hands: dayRec.hands + 1,
      wins: dayRec.wins + (iWon ? 1 : 0),
    };
    const dKeys = Object.keys(next.dailyNetByDate).sort();
    if (dKeys.length > MAX_DAILY_NET_DAYS) {
      for (const k of dKeys.slice(0, dKeys.length - MAX_DAILY_NET_DAYS)) delete next.dailyNetByDate[k];
    }
  }

  const newRank = getRepProgress(next.repXp);
  const rankedUpTo = newRank.level > prevRank.level ? newRank.title : null;

  return {
    dossier: next,
    changed: true,
    handDelta: exactDelta,
    bountiesCleared,
    sweepCleared,
    rankedUpTo,
    bailoutGranted,
  };
}

/** Backwards-compatible wrapper returning updated `PilotDossier`. */
export function recordShowdownToDossier(
  prev: PilotDossier,
  state: ClientGameState,
  myPlayerId: string | null,
  shareTextBuilder?: () => string
): PilotDossier {
  const today = new Date().toISOString().slice(0, 10);
  return settleShowdownToDossier(prev, state, myPlayerId, today, shareTextBuilder).dossier;
}
