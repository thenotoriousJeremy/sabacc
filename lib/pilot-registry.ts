import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DailyLeaderEntry, LeaderboardEntry } from './game-logic';

interface StoredPilotRecord {
  idHash: string;
  callsign: string;
  careerNet: number;
  handsPlayed: number;
  handsWon: number;
  sabaccPotsWon: number;
  biggestPot: number;
  currentStreak: number;
  bestStreak: number;
  cantinaTitles: number;
  recentNetCurve: number[];
  dailyKessel: Record<string, { finalCredits: number; net: number }>;
  updatedAt: number;
}

const MAX_STORED_PILOTS = 500;
const MAX_CURVE_POINTS = 40;
const MAX_DAILY_KEYS_PER_PILOT = 14;

export function hashPilotIdentity(rawKey: string): string {
  return createHash('sha256').update(`sabacc-pilot:${rawKey}`).digest('hex').slice(0, 16);
}

/**
 * Server-persisted Cantina Pilot Registry (`${CONFIG_DIR}/pilots.json`).
 * Tracks honest all-time net credits, win streaks, equity sparklines, and Daily Kessel Run
 * scores across everyone playing on a self-hosted server.
 */
export class PilotRegistryStore {
  private filePath: string;
  private pilots: Record<string, StoredPilotRecord> = {};

  constructor(configDir = process.env.CONFIG_DIR || './data') {
    this.filePath = join(configDir, 'pilots.json');
    try {
      if (existsSync(this.filePath)) {
        const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Record<string, StoredPilotRecord>;
        if (parsed && typeof parsed === 'object') {
          this.pilots = parsed;
        }
      }
    } catch {
      this.pilots = {};
    }
  }

  recordHand(opts: {
    rawPilotKey: string;
    callsign: string;
    netDelta: number;
    won: boolean;
    wonSabaccPot: boolean;
    potWon: number;
    tourCompleted?: boolean;
    dailyFinished?: { dateKey: string; finalCredits: number; net: number } | null;
  }): void {
    if (!opts.rawPilotKey) return;
    const idHash = hashPilotIdentity(opts.rawPilotKey);
    const now = Date.now();
    const existing: StoredPilotRecord = this.pilots[idHash] ?? {
      idHash,
      callsign: opts.callsign,
      careerNet: 0,
      handsPlayed: 0,
      handsWon: 0,
      sabaccPotsWon: 0,
      biggestPot: 0,
      currentStreak: 0,
      bestStreak: 0,
      cantinaTitles: 0,
      recentNetCurve: [0],
      dailyKessel: {},
      updatedAt: now,
    };

    existing.callsign = opts.callsign || existing.callsign;
    existing.careerNet += opts.netDelta;
    existing.handsPlayed += 1;
    if (opts.won) {
      existing.handsWon += 1;
      existing.currentStreak += 1;
      if (existing.currentStreak > existing.bestStreak) {
        existing.bestStreak = existing.currentStreak;
      }
    } else {
      existing.currentStreak = 0;
    }

    if (opts.wonSabaccPot) existing.sabaccPotsWon += 1;
    if (opts.potWon > existing.biggestPot) existing.biggestPot = opts.potWon;
    if (opts.tourCompleted) existing.cantinaTitles += 1;

    existing.recentNetCurve.push(existing.careerNet);
    if (existing.recentNetCurve.length > MAX_CURVE_POINTS) {
      existing.recentNetCurve = existing.recentNetCurve.slice(-MAX_CURVE_POINTS);
    }

    if (opts.dailyFinished) {
      const { dateKey, finalCredits, net } = opts.dailyFinished;
      const prevBest = existing.dailyKessel[dateKey];
      if (!prevBest || finalCredits > prevBest.finalCredits) {
        existing.dailyKessel[dateKey] = { finalCredits, net };
      }
      const keys = Object.keys(existing.dailyKessel).sort();
      if (keys.length > MAX_DAILY_KEYS_PER_PILOT) {
        for (const k of keys.slice(0, keys.length - MAX_DAILY_KEYS_PER_PILOT)) {
          delete existing.dailyKessel[k];
        }
      }
    }

    existing.updatedAt = now;
    this.pilots[idHash] = existing;
    this.pruneIfNeeded();
    this.persist();
  }

  getLeaderboard(limit = 12): LeaderboardEntry[] {
    return Object.values(this.pilots)
      .filter(p => p.handsPlayed > 0)
      .sort((a, b) => b.careerNet - a.careerNet || b.handsWon - a.handsWon)
      .slice(0, limit)
      .map(p => ({
        idHash: p.idHash,
        callsign: p.callsign,
        careerNet: p.careerNet,
        handsPlayed: p.handsPlayed,
        handsWon: p.handsWon,
        sabaccPotsWon: p.sabaccPotsWon,
        biggestPot: p.biggestPot,
        bestStreak: p.bestStreak,
        cantinaTitles: p.cantinaTitles,
        recentNetCurve: p.recentNetCurve,
        updatedAt: p.updatedAt,
      }));
  }

  getDailyLeaderboard(dateKey: string, limit = 10): DailyLeaderEntry[] {
    const entries: DailyLeaderEntry[] = [];
    for (const p of Object.values(this.pilots)) {
      const rec = p.dailyKessel[dateKey];
      if (rec) {
        entries.push({
          idHash: p.idHash,
          callsign: p.callsign,
          finalCredits: rec.finalCredits,
          net: rec.net,
        });
      }
    }
    return entries
      .sort((a, b) => b.finalCredits - a.finalCredits)
      .slice(0, limit);
  }

  deletePilot(rawPilotKey: string): boolean {
    if (!rawPilotKey) return false;
    const idHash = hashPilotIdentity(rawPilotKey);
    if (!this.pilots[idHash]) return false;
    delete this.pilots[idHash];
    this.persist();
    return true;
  }

  private pruneIfNeeded(): void {
    const all = Object.values(this.pilots);
    if (all.length <= MAX_STORED_PILOTS) return;
    all.sort((a, b) => b.updatedAt - a.updatedAt);
    const keep = new Set(all.slice(0, MAX_STORED_PILOTS).map(p => p.idHash));
    for (const key of Object.keys(this.pilots)) {
      if (!keep.has(key)) delete this.pilots[key];
    }
  }

  private persist(): void {
    try {
      const dir = join(this.filePath, '..');
      mkdirSync(dir, { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.pilots, null, 2), 'utf8');
    } catch {
      // Ignore read-only filesystem errors gracefully.
    }
  }
}
