import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { StakesTier } from './game-logic';

export interface ServerConfig {
  sitePasswordHash: string | null;
  adminPasswordHash: string | null;
  publicLobby: boolean;
  defaultStakes: StakesTier;
  lockCreditsGlobal: boolean;
  serverNotice: string;
  publicUrl: string;
  discordWebhookUrl: string;
  discordNotifyRoomCreate: boolean;
  discordNotifyShowdownJackpot: boolean;
  discordAllowPlayerShare: boolean;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !password) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class ServerConfigStore {
  private filePath: string;
  private state: ServerConfig;

  constructor(configDir = process.env.CONFIG_DIR || './data') {
    this.filePath = join(configDir, 'config.json');

    const envSitePw = process.env.SITE_PASSWORD?.trim();
    const envAdminPw = process.env.ADMIN_PASSWORD?.trim();
    const envStakes = process.env.DEFAULT_STAKES as StakesTier | undefined;

    const defaults: ServerConfig = {
      sitePasswordHash: envSitePw ? hashPassword(envSitePw) : null,
      adminPasswordHash: envAdminPw ? hashPassword(envAdminPw) : null,
      publicLobby: process.env.PUBLIC_LOBBY !== 'false',
      defaultStakes:
        envStakes === 'low' || envStakes === 'medium' || envStakes === 'high' || envStakes === 'no_limit'
          ? envStakes
          : 'medium',
      lockCreditsGlobal: process.env.LOCK_CREDITS === 'true',
      serverNotice: (process.env.SERVER_NOTICE ?? '').trim().slice(0, 140),
      publicUrl: (process.env.PUBLIC_URL ?? '').trim().replace(/\/+$/, ''),
      discordWebhookUrl: (process.env.DISCORD_WEBHOOK_URL ?? '').trim(),
      discordNotifyRoomCreate: process.env.DISCORD_NOTIFY_ROOMS !== 'false',
      discordNotifyShowdownJackpot: process.env.DISCORD_NOTIFY_JACKPOTS !== 'false',
      discordAllowPlayerShare: process.env.DISCORD_ALLOW_SHARE !== 'false',
    };

    let persisted: Partial<ServerConfig> = {};
    try {
      if (existsSync(this.filePath)) {
        persisted = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<ServerConfig>;
      }
    } catch {
      // Fall back cleanly to defaults if unreadable.
    }

    this.state = {
      ...defaults,
      ...persisted,
      // Explicit env passwords take precedence if provided so env-managed setups never drift:
      sitePasswordHash: envSitePw ? defaults.sitePasswordHash : (persisted.sitePasswordHash ?? null),
      adminPasswordHash: envAdminPw ? defaults.adminPasswordHash : (persisted.adminPasswordHash ?? null),
    };
  }

  get(): Readonly<ServerConfig> {
    return this.state;
  }

  /** Safe view returned to Admin UI (never exposes hashes, masks webhook token). */
  getRedactedForAdmin() {
    const s = this.state;
    return {
      hasSitePassword: !!s.sitePasswordHash,
      sitePasswordEnvLocked: !!process.env.SITE_PASSWORD?.trim(),
      hasAdminPassword: !!s.adminPasswordHash,
      publicLobby: s.publicLobby,
      defaultStakes: s.defaultStakes,
      lockCreditsGlobal: s.lockCreditsGlobal,
      serverNotice: s.serverNotice,
      publicUrl: s.publicUrl,
      hasDiscordWebhook: !!s.discordWebhookUrl,
      discordWebhookPreview: s.discordWebhookUrl
        ? `${s.discordWebhookUrl.slice(0, 36)}...`
        : '',
      discordNotifyRoomCreate: s.discordNotifyRoomCreate,
      discordNotifyShowdownJackpot: s.discordNotifyShowdownJackpot,
      discordAllowPlayerShare: s.discordAllowPlayerShare,
    };
  }

  update(patch: {
    newSitePassword?: string | null;
    newAdminPassword?: string | null;
    publicLobby?: boolean;
    defaultStakes?: StakesTier;
    lockCreditsGlobal?: boolean;
    serverNotice?: string;
    publicUrl?: string;
    discordWebhookUrl?: string;
    discordNotifyRoomCreate?: boolean;
    discordNotifyShowdownJackpot?: boolean;
    discordAllowPlayerShare?: boolean;
  }): void {
    if (patch.newSitePassword !== undefined && !process.env.SITE_PASSWORD?.trim()) {
      const trimmed = (patch.newSitePassword ?? '').trim();
      this.state.sitePasswordHash = trimmed ? hashPassword(trimmed) : null;
    }
    if (patch.newAdminPassword !== undefined && !process.env.ADMIN_PASSWORD?.trim()) {
      const trimmed = (patch.newAdminPassword ?? '').trim();
      if (trimmed) this.state.adminPasswordHash = hashPassword(trimmed);
    }
    if (typeof patch.publicLobby === 'boolean') this.state.publicLobby = patch.publicLobby;
    if (
      patch.defaultStakes === 'low' ||
      patch.defaultStakes === 'medium' ||
      patch.defaultStakes === 'high' ||
      patch.defaultStakes === 'no_limit'
    ) {
      this.state.defaultStakes = patch.defaultStakes;
    }
    if (typeof patch.lockCreditsGlobal === 'boolean') {
      this.state.lockCreditsGlobal = patch.lockCreditsGlobal;
    }
    if (typeof patch.serverNotice === 'string') {
      this.state.serverNotice = patch.serverNotice.trim().slice(0, 140);
    }
    if (typeof patch.publicUrl === 'string') {
      this.state.publicUrl = patch.publicUrl.trim().replace(/\/+$/, '');
    }
    if (typeof patch.discordWebhookUrl === 'string') {
      this.state.discordWebhookUrl = patch.discordWebhookUrl.trim();
    }
    if (typeof patch.discordNotifyRoomCreate === 'boolean') {
      this.state.discordNotifyRoomCreate = patch.discordNotifyRoomCreate;
    }
    if (typeof patch.discordNotifyShowdownJackpot === 'boolean') {
      this.state.discordNotifyShowdownJackpot = patch.discordNotifyShowdownJackpot;
    }
    if (typeof patch.discordAllowPlayerShare === 'boolean') {
      this.state.discordAllowPlayerShare = patch.discordAllowPlayerShare;
    }

    this.persist();
  }

  private persist(): void {
    try {
      const dir = join(this.filePath, '..');
      mkdirSync(dir, { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err) {
      console.warn('Could not persist config.json (check CONFIG_DIR permissions):', err);
    }
  }
}
