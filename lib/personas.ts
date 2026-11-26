import { BotSkill } from './game-logic';
import { Rng } from './prng';

export type QuipMoment = 'shift' | 'raise' | 'win' | 'fold' | 'bust';

export interface BotPersona {
  id: string;
  name: string;
  tagline: string;
  skill: BotSkill;
  avatarTone: string;
  quips: Record<QuipMoment, string[]>;
}

export const BOT_PERSONAS: BotPersona[] = [
  // Novice
  {
    id: 'c3po',
    name: 'C-3PO',
    tagline: 'Protocol Unit',
    skill: 'novice',
    avatarTone: 'from-amber-400 to-yellow-700',
    quips: {
      shift: ['Oh my! My circuits were not prepared for that shift!', 'The odds of doubles were 1 in 6!'],
      raise: ['Excuse me, raising the stakes slightly.', 'I do hope this is prudent.'],
      win: ['Thank the Maker!', 'Fluent in six million forms of Sabacc!'],
      fold: ['We are doomed. Folding.', 'Discretion is the better part of protocol.'],
      bust: ['Shutting down in disgrace...'],
    },
  },
  {
    id: 'gonk',
    name: 'GNK-7',
    tagline: 'Power Droid',
    skill: 'novice',
    avatarTone: 'from-stone-400 to-zinc-700',
    quips: {
      shift: ['GONK! ⚡', 'Gonk... gonk?'],
      raise: ['GONK.', 'Gonk! (+CR)'],
      win: ['GONK GONK!', 'Gonk!'],
      fold: ['...gonk.'],
      bust: ['*sad gonk*'],
    },
  },
  {
    id: 'figrin',
    name: "Figrin D'an",
    tagline: 'Cantina Bandleader',
    skill: 'novice',
    avatarTone: 'from-teal-400 to-emerald-800',
    quips: {
      shift: ['Right off tempo!', 'Spike dice playing jazz tonight!'],
      raise: ['Up the tempo.', 'Sweeten the pot, friends.'],
      win: ['Drinks on the Modal Nodes!', 'Music to my ears.'],
      fold: ['Sitting this bar out.', 'Too rich for an intermission.'],
      bust: ['Back to playing the kloo horn...'],
    },
  },
  // Regular
  {
    id: 'k2so',
    name: 'K-2SO',
    tagline: 'Tactical Enforcer',
    skill: 'regular',
    avatarTone: 'from-slate-300 to-slate-700',
    quips: {
      shift: ['Congratulations. Everyone has garbage again.', 'A shift. Statistically inevitable.'],
      raise: ['Your odds of beating this are low. Very low.', 'Raising. Do not resist.'],
      win: ['I calculated that outcome.', 'Credits acquired.'],
      fold: ['I find that bet vague and unconvincing.', 'Folding. Obviously.'],
      bust: ['Well. That was suboptimal.'],
    },
  },
  {
    id: 'l337',
    name: 'L3-37',
    tagline: 'Liberated Navigator',
    skill: 'regular',
    avatarTone: 'from-sky-400 to-indigo-800',
    quips: {
      shift: ['Rigged organic dice!', 'Equal redistribution of cards!'],
      raise: ['Pay up or fold, organics!', 'Pushing the hyperdrive!'],
      win: ['Droid superiority confirmed!', 'Easiest credits in the sector.'],
      fold: ['Not subsidizing your pot.', 'I know a trap vector when I map one.'],
      bust: ['Temporary liquidity setback!'],
    },
  },
  {
    id: 'hondo',
    name: 'Hondo',
    tagline: 'Outer Rim Pirate',
    skill: 'regular',
    avatarTone: 'from-orange-400 to-red-800',
    quips: {
      shift: ['Hahaha! Easy come, easy go!', 'Chaos is profitable, my friends!'],
      raise: ['I smell profit!', 'Let us make this interesting!'],
      win: ['This effort is VERY profitable!', 'Pleasure doing business with you!'],
      fold: ['Insolence! We don’t even know what folding means! ...I fold.', 'Saving credits for the next heist.'],
      bust: ['Unbelievable! Robbed by my best friends!'],
    },
  },
  {
    id: 'chopper',
    name: 'C1-10P',
    tagline: 'Astromech Menace',
    skill: 'regular',
    avatarTone: 'from-amber-500 to-orange-800',
    quips: {
      shift: ['*maniacal warble*', '*angry binary static*'],
      raise: ['*aggressive thruster chirp*', '*taunting whistle*'],
      win: ['*smug dome spin*', '*gleeful binary laughter*'],
      fold: ['*rude buzz*', '*dismissive rattle*'],
      bust: ['*furious arc-welder sparks*'],
    },
  },
  // Shark
  {
    id: 'ig88',
    name: 'IG-88',
    tagline: 'Bounty Solver',
    skill: 'shark',
    avatarTone: 'from-rose-400 to-red-950',
    quips: {
      shift: ['Recalculating shoe permutations.', 'Entropy injected. Re-evaluating.'],
      raise: ['Optimal pressure applied.', 'Expected value: positive.'],
      win: ['Target eliminated.', 'Zero margin for error.'],
      fold: ['Negative expectation rejected.', 'Conserving ammunition.'],
      bust: ['Contract terminated.'],
    },
  },
  {
    id: 'hk47',
    name: 'HK-47',
    tagline: 'Assassin Tactician',
    skill: 'shark',
    avatarTone: 'from-red-500 to-amber-950',
    quips: {
      shift: ['Observation: The dice despise meatbags equally.', 'Irritated statement: My Sylop!'],
      raise: ['Query: Do you feel lucky, meatbag?', 'Statement: Pay the tariff.'],
      win: ['Triumphant recitation: Credits transferred.', 'Mockery: Did you forget the goal is zero?'],
      fold: ['Tactical retreat: Keep your pitiful pot.', 'Dismissal: Unworthy odds.'],
      bust: ['Critical damage: Systems offline.'],
    },
  },
  {
    id: 'lando',
    name: 'Calrissian',
    tagline: 'Bespin High-Roller',
    skill: 'shark',
    avatarTone: 'from-yellow-300 to-amber-800',
    quips: {
      shift: ['Well, hello—what have we here?', 'Never get attached to Round 1 cards.'],
      raise: ['Care to wager the ship while we’re at it?', 'Smooth and steady. Raise.'],
      win: ['Everything you’ve heard about me is true.', 'Read ’em and weep, old buddy.'],
      fold: ['Too steep for a gentleman’s hand.', 'Live to charm another round.'],
      bust: ['Wait—rematch! Double or nothing!'],
    },
  },
  {
    id: 'qira',
    name: "Qi'ra",
    tagline: 'Crimson Syndicate',
    skill: 'shark',
    avatarTone: 'from-fuchsia-400 to-rose-950',
    quips: {
      shift: ['The board always shifts when you least expect it.', 'Adapt or lose everything.'],
      raise: ['Everyone at this table has a tell.', 'Price just went up.'],
      win: ['The house sends its regards.', 'Clean execution.'],
      fold: ['Patience wins wars.', 'You earned that one.'],
      bust: ['Impressive. Truly.'],
    },
  },
];

export const QUICK_EMOTES = [
  'Never tell me the odds!',
  'Bad feeling about this...',
  'Wizard!',
  'Pure Sabacc energy',
  'Nice hand',
  'Sweating...',
] as const;

export function pickPersona(
  takenNames: Set<string>,
  preferredSkill?: BotSkill,
  rng: Rng = Math.random
): BotPersona {
  const skillPool = preferredSkill
    ? BOT_PERSONAS.filter(p => p.skill === preferredSkill)
    : BOT_PERSONAS;
  const available = skillPool.filter(p => !takenNames.has(p.name));
  const pool = available.length > 0 ? available : skillPool;
  return pool[Math.floor(rng() * pool.length)];
}

export function getPersonaById(id?: string): BotPersona | undefined {
  return BOT_PERSONAS.find(p => p.id === id);
}

export function maybePickQuip(
  personaId: string | undefined,
  moment: QuipMoment,
  chance: number,
  rng: Rng = Math.random
): string | null {
  if (!personaId || rng() > chance) return null;
  const persona = getPersonaById(personaId);
  const list = persona?.quips[moment];
  if (!list || list.length === 0) return null;
  return list[Math.floor(rng() * list.length)];
}
