/**
 * Lightweight, zero-dependency User-Generated Content (UGC) filter & report store
 * satisfying Apple App Store Guideline 1.2 & Google Play UGC safety requirements
 * for multiplayer callsigns and table chat.
 */

const BLOCKED_TERMS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'dick',
  'cock',
  'pussy',
  'slut',
  'whore',
  'faggot',
  'fag',
  'nigger',
  'nigga',
  'retard',
  'kike',
  'spic',
  'chink',
  'rape',
  'nazi',
];

const BLOCKED_REGEX = new RegExp(
  `\\b(${BLOCKED_TERMS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\w*\\b`,
  'gi'
);

/** Masks common profanity and slurs in free-form multiplayer chat messages. */
export function filterProfanity(input: string): string {
  return input.replace(BLOCKED_REGEX, match => '*'.repeat(Math.min(6, Math.max(3, match.length))));
}

/** Ensures callsigns do not contain slurs/profanity, falling back cleanly if needed. */
export function filterCallsign(input: string, fallback = 'Pilot'): string {
  const cleaned = input.replace(BLOCKED_REGEX, '').replace(/\s+/g, ' ').trim();
  return cleaned.length >= 2 ? cleaned : fallback;
}

export interface PlayerReportEntry {
  id: string;
  roomId: string;
  reporterName: string;
  reportedName: string;
  reason: string;
  timestamp: number;
}
