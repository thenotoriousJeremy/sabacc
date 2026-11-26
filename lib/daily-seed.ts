import { DailyRunState, TableSettings } from './game-logic';
import { createSeededRng, Rng } from './prng';

export const DAILY_KESSEL_SETTINGS: TableSettings = {
  stakesTier: 'low',
  ante: 10,
  sabaccAnte: 5,
  tableLimit: 250,
  tieRule: 'split',
  turnSeconds: 0,
  lockedCredits: true,
  startingCredits: 250,
};

export const DAILY_KESSEL_MAX_HANDS = 5;
export const DAILY_KESSEL_BOT_IDS = ['ig88', 'lando', 'k2so'];
export const DAILY_KESSEL_BOT_STACK = 1000;

export function getUtcDateKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function normalizeDailyKey(raw: unknown): string {
  const str = String(raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : getUtcDateKey();
}

export function createDailyRng(dateKey: string): Rng {
  return createSeededRng(`corellian-spike-kessel-run:${dateKey}`);
}

export function kesselStarRating(finalCredits: number, starting = DAILY_KESSEL_SETTINGS.startingCredits): string {
  if (finalCredits <= 0) return '💥 BUSTED';
  if (finalCredits >= starting * 2.5) return '★★★ PARSEC RECORD';
  if (finalCredits >= starting * 1.5) return '★★☆ KESSEL ACE';
  if (finalCredits > starting) return '★☆☆ IN THE BLACK';
  return '☆☆☆ SURVIVED';
}

/** Generates a spoiler-free copy-paste summary card for Discord and group chats. */
export function formatKesselShareCard(daily: DailyRunState, finalCredits: number): string {
  const net = finalCredits - daily.startingCredits;
  const netStr = net >= 0 ? `+${net}` : `${net}`;
  const rating = kesselStarRating(finalCredits, daily.startingCredits);

  const stamps = daily.history
    .map(h => {
      const icon = h.won ? (h.rankKey !== 'nulrhek' && h.rankKey !== 'sabacc' ? '🏆' : '🟢') : h.delta < 0 ? '🔴' : '⚪';
      const shift = h.shifted ? '⚡' : '';
      const d = h.delta >= 0 ? `+${h.delta}` : `${h.delta}`;
      return `${shift}${icon}${d}`;
    })
    .join('  ');

  const best = [...daily.history].sort((a, b) => b.delta - a.delta)[0];
  const lines = [
    `SABACC • DAILY KESSEL RUN ${daily.dateKey}`,
    `Stack: ${finalCredits} CR (${netStr} CR) • ${rating}`,
    stamps || 'No hands logged',
  ];
  if (best) {
    lines.push(`Peak Hand: ${best.rankName} (${best.delta >= 0 ? `+${best.delta}` : best.delta} CR)`);
  }
  return lines.join('\n');
}
