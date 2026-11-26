import { StakesTier, TableSettings } from './game-logic';

export interface CantinaStage {
  index: number;
  id: string;
  venueName: string;
  venueSubtitle: string;
  planet: string;
  flavor: string;
  startingCredits: number;
  targetCredits: number;
  botStack: number;
  rosterPersonaIds: string[];
  settings: TableSettings;
  feltThemeId: string;
  unlockSummary: string;
}

export const CANTINA_STAGES: CantinaStage[] = [
  {
    index: 0,
    id: 'mos-eisley',
    venueName: "Chalmun's Cantina",
    venueSubtitle: 'Mos Eisley • Docking Bay 94',
    planet: 'Tatooine',
    flavor: 'Scruffy droids and moisture farmers calling way too loose.',
    startingCredits: 500,
    targetCredits: 850,
    botStack: 600,
    rosterPersonaIds: ['c3po', 'gonk', 'figrin'],
    settings: {
      stakesTier: 'low' as StakesTier,
      ante: 10,
      sabaccAnte: 5,
      tableLimit: 150,
      tieRule: 'split',
      turnSeconds: 0,
      lockedCredits: true,
      startingCredits: 500,
    },
    feltThemeId: 'tatooine-sand',
    unlockSummary: 'Tatooine Dune Felt & Worn Copper Card Back',
  },
  {
    index: 1,
    id: 'coronet-den',
    venueName: 'Coronet Shipyard Den',
    venueSubtitle: 'Corellia • Axial Park',
    planet: 'Corellia',
    flavor: 'Home turf of Corellian Spike. Smugglers who love semi-bluffing.',
    startingCredits: 850,
    targetCredits: 1600,
    botStack: 1500,
    rosterPersonaIds: ['hondo', 'l337', 'chopper'],
    settings: {
      stakesTier: 'medium',
      ante: 20,
      sabaccAnte: 10,
      tableLimit: 350,
      tieRule: 'split',
      turnSeconds: 0,
      lockedCredits: true,
      startingCredits: 850,
    },
    feltThemeId: 'corellian-teal',
    unlockSummary: 'Corellian Teal Felt & Beskar Steel Card Back',
  },
  {
    index: 2,
    id: 'vandor-lodge',
    venueName: 'Fort Ypso Lodge',
    venueSubtitle: 'Vandor • Frontier Outpost',
    planet: 'Vandor',
    flavor: 'Fur-draped heavies and your first assassin-droid card counter.',
    startingCredits: 1600,
    targetCredits: 3200,
    botStack: 3000,
    rosterPersonaIds: ['k2so', 'hondo', 'hk47'],
    settings: {
      stakesTier: 'medium',
      ante: 40,
      sabaccAnte: 20,
      tableLimit: 800,
      tieRule: 'split',
      turnSeconds: 0,
      lockedCredits: true,
      startingCredits: 1600,
    },
    feltThemeId: 'vandor-frost',
    unlockSummary: 'Vandor Frost Felt & Crimson Syndicate Card Back',
  },
  {
    index: 3,
    id: 'bespin-suite',
    venueName: 'Cloud City Sabacc Suite',
    venueSubtitle: 'Bespin • Tibanna Plaza',
    planet: 'Bespin',
    flavor: 'Smooth high-rollers pricing every draw and punishing weak checks.',
    startingCredits: 3200,
    targetCredits: 6500,
    botStack: 6500,
    rosterPersonaIds: ['lando', 'l337', 'ig88'],
    settings: {
      stakesTier: 'high',
      ante: 80,
      sabaccAnte: 40,
      tableLimit: 2000,
      tieRule: 'split',
      turnSeconds: 0,
      lockedCredits: true,
      startingCredits: 3200,
    },
    feltThemeId: 'bespin-gold',
    unlockSummary: 'Bespin Cloud Gold Felt & Tibanna Amber Dice',
  },
  {
    index: 4,
    id: 'canto-vault',
    venueName: 'Canto Bight Vault',
    venueSubtitle: 'Cantonica • No-Limit Championship',
    planet: 'Cantonica',
    flavor: 'Four apex sharks, uncapped pots, and zero second chances.',
    startingCredits: 6500,
    targetCredits: 12000,
    botStack: 12000,
    rosterPersonaIds: ['qira', 'lando', 'ig88', 'hk47'],
    settings: {
      stakesTier: 'no_limit',
      ante: 150,
      sabaccAnte: 75,
      tableLimit: 0,
      tieRule: 'split',
      turnSeconds: 0,
      lockedCredits: true,
      startingCredits: 6500,
    },
    feltThemeId: 'canto-obsidian',
    unlockSummary: 'Canto Obsidian Felt, Halcyon Holo Cards & Obsidian Dice',
  },
];

export function getCantinaStage(index: number): CantinaStage {
  return CANTINA_STAGES[Math.max(0, Math.min(CANTINA_STAGES.length - 1, index))];
}
