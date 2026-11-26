import { createServer } from 'http';
import { parse } from 'url';
import { dirname, join } from 'path';
import { networkInterfaces, type NetworkInterfaceInfo } from 'os';
import { randomInt, randomUUID } from 'crypto';
import { Server } from 'socket.io';
import express, { type Request, type Response } from 'express';
import {
  beginOidcLogin,
  clearSessionCookie,
  completeOidcCallback,
  issueSessionCookie,
  readAuthSessionFromCookieHeader,
  readOidcEnv,
} from './lib/auth';
import { postDiscordEmbed } from './lib/discord';
import { getUtcDateKey } from './lib/daily-seed';
import {
  BotSkill,
  GameMode,
  GameState,
  LobbySnapshot,
  Player,
  PublicRoomSummary,
  STAKES_PRESETS,
  StakesTier,
  TieRule,
} from './lib/game-logic';
import { QUICK_EMOTES } from './lib/personas';
import { Rng } from './lib/prng';
import {
  addBotToGame,
  advanceCantinaTourStage,
  applyBetAction,
  applyCardAction,
  canStartHand,
  createRoomState,
  dealNewHand,
  executeSabaccShift,
  finishDicePhase,
  isPresent,
  performBotTurn,
  populateSoloBots,
  sanitizeStateFor,
  syncLedgerPlayer,
  totalAnte,
  trimLogs,
} from './lib/room-engine';
import { ServerConfigStore, verifyPassword } from './lib/server-config';
import { PilotRegistryStore } from './lib/pilot-registry';
import { filterCallsign, filterProfanity, PlayerReportEntry } from './lib/moderation';

const dev = process.env.NODE_ENV !== 'production';

const staticDir =
  process.env.STATIC_DIR ??
  (process.env.SABACC_PACKAGED === 'true' ? join(dirname(process.execPath), 'web') : undefined);

const port = Number(process.env.PORT) || 3000;

const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const PACKAGED_CLIENT_ORIGINS = [
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'file://',
];

function isPrivateHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local')) return true;
  if (/^127\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
}

function isAllowedOrigin(origin: string | undefined, publicUrl?: string, hostHeader?: string): boolean {
  if (!origin) return true;
  if (configuredOrigins.length > 0) return configuredOrigins.includes(origin);
  if (PACKAGED_CLIENT_ORIGINS.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    if (isPrivateHostname(parsed.hostname)) return true;
    if (publicUrl) {
      try {
        if (new URL(publicUrl).origin === parsed.origin) return true;
      } catch {
        // Ignore malformed publicUrl.
      }
    }
    if (hostHeader && parsed.host.toLowerCase() === hostHeader.toLowerCase()) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 5;

function normalizeRoomCode(raw: unknown): string | null {
  const code = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{4,6}$/.test(code) ? code : null;
}

const MAX_NAME_LENGTH = 20;
const MAX_CHAT_LENGTH = 300;
const MAX_CREDITS = 1_000_000;
const MAX_BUY_IN = 100_000;
const MAX_PLAYERS_PER_ROOM = 6;
const ROOM_GRACE_PERIOD_MS = 60_000;
const EMPTY_ROOM_TTL_MS = 120_000;
const MAX_ROOMS = 500;

const AI_TURN_DELAY_MS = 700;
const DICE_TUMBLE_MS = 1350;
const SHIFT_HOLD_MS = 1650;
const NO_SHIFT_HOLD_MS = 850;
const SHOWDOWN_AUTO_RETURN_MS = 16_000;

const RATE_BURST = 50;
const RATE_REFILL_PER_SEC = 15;

function sanitizeName(raw: unknown, fallback: string): string {
  const name = String(raw ?? '')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return filterCallsign(name, fallback);
}

function clampInt(raw: unknown, min: number, max: number): number | null {
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function validMode(raw: unknown): GameMode {
  if (raw === 'quick_solo' || raw === 'cantina_tour' || raw === 'daily_kessel' || raw === 'party') {
    return raw;
  }
  return 'party';
}

function validStakes(raw: unknown, fallback: StakesTier = 'medium'): StakesTier {
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'no_limit') return raw;
  return fallback;
}

function isLoopbackReq(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

async function bootstrap() {
  const configStore = new ServerConfigStore();
  const pilotRegistry = new PilotRegistryStore();
  const oidcConfig = readOidcEnv();
  const recentReports: PlayerReportEntry[] = [];
  let lastDetectedWebOrigin = '';

  function rememberOriginCandidate(originHeader?: string, protoHeader?: string, hostHeader?: string) {
    if (originHeader && /^https?:\/\//i.test(originHeader) && !PACKAGED_CLIENT_ORIGINS.includes(originHeader)) {
      lastDetectedWebOrigin = originHeader.replace(/\/+$/, '');
      return;
    }
    if (hostHeader && !hostHeader.startsWith('127.0.0.1') && !hostHeader.startsWith('localhost')) {
      const proto = (protoHeader || 'http').split(',')[0].trim();
      const host = hostHeader.split(',')[0].trim();
      if (host) lastDetectedWebOrigin = `${proto}://${host}`.replace(/\/+$/, '');
    }
  }

  function resolveSiteUrl(req?: Request): string {
    const configured = configStore.get().publicUrl;
    if (configured) return configured.replace(/\/+$/, '');
    if (req) {
      const origin = req.headers.origin;
      if (origin && /^https?:\/\//i.test(origin) && !PACKAGED_CLIENT_ORIGINS.includes(origin)) {
        return origin.replace(/\/+$/, '');
      }
      const fwdProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
        .split(',')[0]
        .trim();
      const fwdHost = String(req.headers['x-forwarded-host'] || req.get('host') || '')
        .split(',')[0]
        .trim();
      if (fwdHost) return `${fwdProto}://${fwdHost}`.replace(/\/+$/, '');
    }
    return lastDetectedWebOrigin;
  }

  function resolveDiscordAvatarUrl(siteUrl: string): string | undefined {
    if (!siteUrl) return undefined;
    try {
      const parsed = new URL(siteUrl);
      if (isPrivateHostname(parsed.hostname)) return undefined;
      return `${siteUrl}/icon-maskable.png`;
    } catch {
      return undefined;
    }
  }

  const expressApp = express();
  if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
    expressApp.set('trust proxy', 1);
  }

  expressApp.disable('x-powered-by');
  expressApp.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  expressApp.use(express.json({ limit: '32kb' }));

  const server = createServer(expressApp);
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (configuredOrigins.length > 0) return callback(null, configuredOrigins.includes(origin));
        // Exact origin & same-host enforcement runs in `allowRequest` below where `req.headers` is available.
        callback(null, true);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      const fwdHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
        .split(',')[0]
        .trim();
      callback(null, isAllowedOrigin(origin, configStore.get().publicUrl, fwdHost));
    },
  });

  const games: Record<string, GameState> = {};
  const roomRngs = new Map<string, Rng>();

  interface Session {
    token: string;
    roomId: string;
    playerId: string;
  }

  const sessionsByToken = new Map<string, Session>();
  const sessionsBySocket = new Map<string, Session>();
  const pendingRemoval = new Map<string, NodeJS.Timeout>();
  const roomNamedTimers = new Map<string, Map<string, NodeJS.Timeout>>();

  function isSiteLocked(): boolean {
    return !!configStore.get().sitePasswordHash || !!oidcConfig?.requireAuth;
  }

  function isRequestAuthenticated(req: Request): boolean {
    if (!isSiteLocked()) return true;
    return !!readAuthSessionFromCookieHeader(req.headers.cookie);
  }

  function requireAdmin(req: Request, res: Response): boolean {
    const sess = readAuthSessionFromCookieHeader(req.headers.cookie);
    if (!sess?.isAdmin) {
      res.status(403).json({ error: 'Administrator clearance required.' });
      return false;
    }
    return true;
  }

  function buildLobbySnapshot(): LobbySnapshot {
    const cfg = configStore.get();
    const rooms: PublicRoomSummary[] = [];
    let pilotsOnline = 0;

    for (const g of Object.values(games)) {
      const liveHumans = g.players.filter(p => !p.isAI && p.isConnected !== false);
      pilotsOnline += liveHumans.length;

      if (cfg.publicLobby && g.mode === 'party' && g.isPublic !== false && liveHumans.length > 0) {
        const host = g.players.find(p => p.id === g.hostId) ?? liveHumans[0];
        const seated = g.players.filter(p => !p.isSpectator);
        const spectators = g.players.filter(p => p.isSpectator);
        rooms.push({
          roomId: g.roomId,
          hostName: host?.name ?? 'Cantina Host',
          stakesTier: g.settings.stakesTier,
          ante: g.settings.ante,
          sabaccAnte: g.settings.sabaccAnte,
          seatedCount: seated.length,
          maxPlayers: MAX_PLAYERS_PER_ROOM,
          spectatorCount: spectators.length,
          currentPhase: g.currentPhase,
          currentRound: g.currentRound,
        });
      }
    }

    return {
      rooms,
      pilotsOnline,
      serverNotice: cfg.serverNotice,
      discordShareEnabled: !!(cfg.discordWebhookUrl && cfg.discordAllowPlayerShare),
      leaderboard: pilotRegistry.getLeaderboard(12),
      dailyLeaderboard: pilotRegistry.getDailyLeaderboard(getUtcDateKey(), 10),
    };
  }

  function broadcastLobby() {
    io.emit('lobbyUpdate', buildLobbySnapshot());
  }

  function rngFor(roomId: string): Rng {
    return roomRngs.get(roomId) ?? Math.random;
  }

  function scheduleNamed(roomId: string, slot: string, fn: () => void, ms: number) {
    cancelNamed(roomId, slot);
    const timers = roomNamedTimers.get(roomId) ?? new Map<string, NodeJS.Timeout>();
    const handle = setTimeout(() => {
      timers.delete(slot);
      if (!games[roomId]) return;
      fn();
    }, Math.max(0, ms));
    timers.set(slot, handle);
    roomNamedTimers.set(roomId, timers);
  }

  function cancelNamed(roomId: string, slot: string) {
    const timers = roomNamedTimers.get(roomId);
    const existing = timers?.get(slot);
    if (existing) {
      clearTimeout(existing);
      timers!.delete(slot);
    }
  }

  function clearGameFlowTimers(roomId: string) {
    for (const slot of ['ai', 'dice', 'shift', 'showdown', 'turnClock']) {
      cancelNamed(roomId, slot);
    }
  }

  function destroyRoom(roomId: string) {
    for (const handle of roomNamedTimers.get(roomId)?.values() ?? []) clearTimeout(handle);
    roomNamedTimers.delete(roomId);
    roomRngs.delete(roomId);
    for (const [token, session] of sessionsByToken) {
      if (session.roomId === roomId) sessionsByToken.delete(token);
    }
    delete games[roomId];
    broadcastLobby();
  }

  function broadcastRoom(roomId: string) {
    const game = games[roomId];
    if (!game) return;
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (!roomSockets) return;
    for (const sockId of roomSockets) {
      const sock = io.sockets.sockets.get(sockId);
      if (!sock) continue;
      const viewerId = sessionsBySocket.get(sockId)?.playerId ?? null;
      sock.emit('gameStateUpdate', sanitizeStateFor(game, viewerId));
    }
  }

  function ensureHost(game: GameState) {
    const currentHost = game.players.find(p => p.id === game.hostId && !p.isAI && isPresent(p));
    if (currentHost) return;
    const nextHost = game.players.find(p => !p.isAI && isPresent(p));
    game.hostId = nextHost?.id ?? null;
  }

  function generateRoomCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!games[code]) return code;
    }
    throw new Error('Could not allocate a free room code');
  }

  function resolveActor(socketId: string): { game: GameState; player: Player } | null {
    const session = sessionsBySocket.get(socketId);
    if (!session) return null;
    const game = games[session.roomId];
    if (!game) return null;
    const player = game.players.find(p => p.id === session.playerId);
    return player ? { game, player } : null;
  }

  function maybeNotifyJackpot(game: GameState) {
    const cfg = configStore.get();
    if (!cfg.discordWebhookUrl || !cfg.discordNotifyShowdownJackpot || !game.showdownResult) return;

    const siteUrl = resolveSiteUrl();
    const tableUrl =
      siteUrl && game.mode === 'party' && game.isPublic !== false
        ? `${siteUrl}/?room=${game.roomId}`
        : siteUrl || undefined;

    const sabaccWin = game.showdownResult.payouts.find(p => p.label === 'Sabacc Pot' && p.amount >= 25);
    if (sabaccWin) {
      const top = game.showdownResult.standings[0];
      postDiscordEmbed(cfg.discordWebhookUrl, {
        title: `🏆 Sabacc Pot Claimed — ${sabaccWin.amount} CR!`,
        description: `**${sabaccWin.winnerNames.join(' & ')}** swept the Sabacc Pot in Room \`${game.roomId}\` with **${top?.evaluation.rankName ?? 'Specialty Sabacc'}**!${
          tableUrl ? `\n\n👉 **[Play at the Holotable](${tableUrl})**` : ''
        }`,
        url: tableUrl,
        avatarUrl: resolveDiscordAvatarUrl(siteUrl),
        color: 0xf43f5e,
      }).catch(() => {});
    } else if (game.tour?.tourCompleted) {
      const hero = game.players.find(p => !p.isAI);
      if (hero) {
        postDiscordEmbed(cfg.discordWebhookUrl, {
          title: '👑 Outer Rim Cantina Tour Conquered!',
          description: `**${hero.name}** cleared Canto Bight with **${hero.credits} CR**!${
            siteUrl ? `\n\n👉 **[Challenge the Cantina Tour](${siteUrl})**` : ''
          }`,
          url: siteUrl || undefined,
          avatarUrl: resolveDiscordAvatarUrl(siteUrl),
          color: 0xfbbf24,
        }).catch(() => {});
      }
    }
  }

  function armTurnAndPhaseTimers(game: GameState) {
    const roomId = game.roomId;
    cancelNamed(roomId, 'turnClock');
    cancelNamed(roomId, 'ai');

    if (game.currentPhase === 'CARD' || game.currentPhase === 'BETTING') {
      const current = game.players[game.turnIndex];
      if (!current || current.isFolded) return;

      if (current.isAI) {
        game.turnExpires = null;
        const jitter = game.mode === 'daily_kessel' ? 0 : Math.floor(Math.random() * 240);
        scheduleNamed(
          roomId,
          'ai',
          () => {
            const prevPhase = game.currentPhase;
            const nextPhase = performBotTurn(game, rngFor(roomId));
            onPhasePotentiallyChanged(game, prevPhase, nextPhase);
            broadcastRoom(roomId);
          },
          AI_TURN_DELAY_MS + jitter
        );
      } else if (game.settings.turnSeconds > 0) {
        game.turnExpires = Date.now() + game.settings.turnSeconds * 1000;
        scheduleNamed(
          roomId,
          'turnClock',
          () => {
            const active = game.players[game.turnIndex];
            if (!active || active.id !== current.id || active.isAI || active.isFolded) return;
            game.logs.push(`⏱ ${active.name} ran out of time.`);
            const prevPhase = game.currentPhase;
            let nextPhase = prevPhase;
            if (game.currentPhase === 'CARD') {
              nextPhase = applyCardAction(game, active.id, 'stand', undefined, rngFor(roomId)).nextPhase;
            } else if (game.currentPhase === 'BETTING') {
              const canCheck = game.currentBet <= active.betThisRound;
              nextPhase = applyBetAction(
                game,
                active.id,
                canCheck ? 'check' : 'fold',
                undefined,
                rngFor(roomId)
              ).nextPhase;
            }
            onPhasePotentiallyChanged(game, prevPhase, nextPhase);
            broadcastRoom(roomId);
          },
          game.settings.turnSeconds * 1000
        );
      } else {
        game.turnExpires = null;
      }
    }
  }

  function onPhasePotentiallyChanged(
    game: GameState,
    prevPhase: GameState['currentPhase'],
    nextPhase: GameState['currentPhase']
  ) {
    const roomId = game.roomId;
    if (nextPhase === 'DICE' && prevPhase !== 'DICE') {
      game.turnExpires = null;
      cancelNamed(roomId, 'turnClock');
      cancelNamed(roomId, 'ai');

      scheduleNamed(
        roomId,
        'dice',
        () => {
          if (game.currentPhase !== 'DICE') return;
          if (game.shiftPending) {
            executeSabaccShift(game, rngFor(roomId));
            broadcastRoom(roomId);
            scheduleNamed(
              roomId,
              'shift',
              () => {
                if (game.currentPhase !== 'DICE') return;
                const after = finishDicePhase(game, rngFor(roomId));
                onPhasePotentiallyChanged(game, 'DICE', after);
                broadcastRoom(roomId);
              },
              SHIFT_HOLD_MS
            );
          } else {
            scheduleNamed(
              roomId,
              'shift',
              () => {
                if (game.currentPhase !== 'DICE') return;
                const after = finishDicePhase(game, rngFor(roomId));
                onPhasePotentiallyChanged(game, 'DICE', after);
                broadcastRoom(roomId);
              },
              NO_SHIFT_HOLD_MS
            );
          }
        },
        DICE_TUMBLE_MS
      );
      return;
    }

    if (nextPhase === 'SHOWDOWN') {
      game.turnExpires = null;
      clearGameFlowTimers(roomId);
      if (game.showdownResult) {
        for (const p of game.players) {
          if (p.isAI || p.isSpectator || !p.pilotKey) continue;
          const netDelta = game.showdownResult.netByPlayer?.[p.id] ?? 0;
          const won = game.winnerIds.includes(p.id);
          let potWon = 0;
          let wonSabaccPot = false;
          for (const pay of game.showdownResult.payouts) {
            if (pay.winnerIds.includes(p.id)) {
              potWon += Math.floor(pay.amount / Math.max(1, pay.winnerIds.length));
              if (pay.label === 'Sabacc Pot') wonSabaccPot = true;
            }
          }
          pilotRegistry.recordHand({
            rawPilotKey: p.pilotKey,
            callsign: p.name,
            netDelta,
            won,
            wonSabaccPot,
            potWon,
            tourCompleted: !!game.tour?.tourCompleted,
            dailyFinished: game.daily?.finished
              ? {
                  dateKey: game.daily.dateKey,
                  finalCredits: p.credits,
                  net: p.credits - game.daily.startingCredits,
                }
              : null,
          });
        }
      }
      maybeNotifyJackpot(game);
      broadcastLobby();
      if (game.mode === 'party') {
        scheduleNamed(
          roomId,
          'showdown',
          () => {
            if (game.currentPhase === 'SHOWDOWN') {
              game.currentPhase = 'JOINING';
              broadcastRoom(roomId);
              broadcastLobby();
            }
          },
          SHOWDOWN_AUTO_RETURN_MS
        );
      }
      return;
    }

    armTurnAndPhaseTimers(game);
  }

  function launchHand(game: GameState) {
    clearGameFlowTimers(game.roomId);
    const phase = dealNewHand(game, rngFor(game.roomId));
    onPhasePotentiallyChanged(game, 'JOINING', phase);
    broadcastLobby();
  }

  // --- HTTP Auth, Lobby, Discord & Admin Endpoints ------------------------

  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  function checkLoginThrottle(ip: string): boolean {
    const now = Date.now();
    const rec = loginAttempts.get(ip);
    if (!rec || now > rec.resetAt) {
      loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    rec.count += 1;
    return rec.count <= 10;
  }

  expressApp.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      rooms: Object.keys(games).length,
      uptime: Math.round(process.uptime()),
    });
  });

  expressApp.get('/readyz', (_req, res) => {
    res.json({ ready: true });
  });

  expressApp.get('/api/lan-info', (req, res) => {
    if (!isRequestAuthenticated(req)) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    res.json({ port, addresses: localAddresses(), publicUrl: configStore.get().publicUrl });
  });

  expressApp.get('/api/lobby', (req, res) => {
    if (!isRequestAuthenticated(req)) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    res.json(buildLobbySnapshot());
  });

  expressApp.get('/api/leaderboard', (req, res) => {
    if (!isRequestAuthenticated(req)) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    res.json({
      leaderboard: pilotRegistry.getLeaderboard(20),
      dailyLeaderboard: pilotRegistry.getDailyLeaderboard(getUtcDateKey(), 15),
      dateKey: getUtcDateKey(),
    });
  });

  expressApp.post('/api/pilot/delete', (req, res) => {
    const authSess = readAuthSessionFromCookieHeader(req.headers.cookie);
    const bodyKey =
      typeof req.body?.pilotKey === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(req.body.pilotKey)
        ? req.body.pilotKey
        : '';
    const resolvedKey = authSess?.sub ? `oidc:${authSess.sub}` : bodyKey;
    const deleted = resolvedKey ? pilotRegistry.deletePilot(resolvedKey) : false;
    res.json({ ok: true, deleted });
  });

  expressApp.get('/api/auth/status', (req, res) => {
    const sess = readAuthSessionFromCookieHeader(req.headers.cookie);
    const cfg = configStore.get();
    res.json({
      locked: isSiteLocked(),
      authenticated: !isSiteLocked() || !!sess,
      passwordEnabled: !!cfg.sitePasswordHash,
      oidcEnabled: !!oidcConfig,
      oidcProviderName: oidcConfig?.providerName ?? 'SSO',
      adminConfigured: !!cfg.adminPasswordHash || !!oidcConfig,
      canBootstrapAdmin: !cfg.adminPasswordHash && isLoopbackReq(req),
      user: sess
        ? { name: sess.name, isAdmin: sess.isAdmin, authMethod: sess.authMethod }
        : null,
    });
  });

  expressApp.post('/api/auth/login', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkLoginThrottle(ip)) {
      res.status(429).json({ error: 'Too many login attempts. Wait 60 seconds.' });
      return;
    }
    const password = String(req.body?.password ?? '');
    const callsign = sanitizeName(req.body?.callsign, 'Pilot');
    const cfg = configStore.get();

    if (cfg.adminPasswordHash && verifyPassword(password, cfg.adminPasswordHash)) {
      issueSessionCookie(res, req, {
        sub: 'admin',
        name: callsign,
        isAdmin: true,
        authMethod: 'admin_password',
      });
      res.json({ ok: true, isAdmin: true });
      return;
    }

    if (cfg.sitePasswordHash && verifyPassword(password, cfg.sitePasswordHash)) {
      issueSessionCookie(res, req, {
        sub: `pilot-${randomUUID()}`,
        name: callsign,
        isAdmin: false,
        authMethod: 'password',
      });
      res.json({ ok: true, isAdmin: false });
      return;
    }

    res.status(401).json({ error: 'Invalid access code.' });
  });

  expressApp.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  expressApp.get('/api/auth/oidc/login', async (req, res) => {
    if (!oidcConfig) {
      res.status(404).send('OIDC is not configured on this server.');
      return;
    }
    try {
      await beginOidcLogin(req, res, oidcConfig, configStore.get().publicUrl);
    } catch (err) {
      res.status(502).send(err instanceof Error ? err.message : 'OIDC login failed.');
    }
  });

  expressApp.get('/api/auth/oidc/callback', async (req, res) => {
    if (!oidcConfig) {
      res.status(404).send('OIDC is not configured on this server.');
      return;
    }
    try {
      await completeOidcCallback(req, res, oidcConfig);
    } catch (err) {
      res.status(502).send(err instanceof Error ? err.message : 'OIDC callback failed.');
    }
  });

  expressApp.post('/api/admin/login', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkLoginThrottle(ip)) {
      res.status(429).json({ error: 'Too many attempts. Wait 60 seconds.' });
      return;
    }
    const password = String(req.body?.password ?? '').trim();
    const cfg = configStore.get();

    // Localhost first-run bootstrap if ADMIN_PASSWORD was not set yet:
    if (!cfg.adminPasswordHash && isLoopbackReq(req) && password.length >= 6) {
      configStore.update({ newAdminPassword: password });
      issueSessionCookie(res, req, {
        sub: 'admin',
        name: 'Administrator',
        isAdmin: true,
        authMethod: 'admin_password',
      });
      res.json({ ok: true, bootstrapped: true });
      return;
    }

    if (!cfg.adminPasswordHash) {
      res.status(403).json({
        error: 'Set ADMIN_PASSWORD in your environment or .env to enable remote Admin access.',
      });
      return;
    }

    if (!verifyPassword(password, cfg.adminPasswordHash)) {
      res.status(401).json({ error: 'Invalid admin password.' });
      return;
    }

    const existing = readAuthSessionFromCookieHeader(req.headers.cookie);
    issueSessionCookie(res, req, {
      sub: existing?.sub ?? 'admin',
      name: existing?.name ?? 'Administrator',
      email: existing?.email,
      isAdmin: true,
      authMethod: 'admin_password',
    });
    res.json({ ok: true });
  });

  expressApp.get('/api/admin/overview', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const activeRooms = Object.values(games).map(g => ({
      roomId: g.roomId,
      mode: g.mode,
      isPublic: g.isPublic !== false,
      phase: g.currentPhase,
      round: g.currentRound,
      handPot: g.handPot,
      sabaccPot: g.sabaccPot,
      players: g.players.map(p => ({
        id: p.id,
        name: p.name,
        isAI: !!p.isAI,
        credits: p.credits,
        connected: p.isConnected !== false,
      })),
    }));

    res.json({
      config: configStore.getRedactedForAdmin(),
      rooms: activeRooms,
      reports: recentReports.slice(-25).reverse(),
      stats: {
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1048576),
        connectedSockets: io.engine.clientsCount,
      },
    });
  });

  expressApp.post('/api/admin/config', (req, res) => {
    if (!requireAdmin(req, res)) return;
    configStore.update(req.body ?? {});
    broadcastLobby();
    res.json({ ok: true, config: configStore.getRedactedForAdmin() });
  });

  expressApp.post('/api/admin/close-room', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const code = normalizeRoomCode(req.body?.roomId);
    if (!code || !games[code]) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }
    io.to(code).emit('joinRejected', { reason: 'Table closed by server administrator.' });
    destroyRoom(code);
    res.json({ ok: true });
  });

  expressApp.post('/api/admin/discord-test', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const cfg = configStore.get();
    const siteUrl = resolveSiteUrl(req);
    const result = await postDiscordEmbed(cfg.discordWebhookUrl, {
      title: '🛸 Cantina Holotable Connected',
      description: siteUrl
        ? `Test transmission from your Corellian Spike Sabacc server.\n\n👉 **[Open Sabacc Holotable](${siteUrl})**`
        : 'Test transmission from your Corellian Spike Sabacc server.',
      url: siteUrl || undefined,
      avatarUrl: resolveDiscordAvatarUrl(siteUrl),
      color: 0x22d3ee,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  expressApp.post('/api/discord/share', async (req, res) => {
    if (!isRequestAuthenticated(req)) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const cfg = configStore.get();
    if (!cfg.discordWebhookUrl || !cfg.discordAllowPlayerShare) {
      res.status(400).json({ error: 'Discord sharing is not enabled on this server.' });
      return;
    }
    const shareText = String(req.body?.shareText ?? '').trim().slice(0, 800);
    const pilot = sanitizeName(req.body?.pilot, 'Pilot');
    if (!shareText) {
      res.status(400).json({ error: 'Nothing to share.' });
      return;
    }
    const siteUrl = resolveSiteUrl(req);
    const result = await postDiscordEmbed(cfg.discordWebhookUrl, {
      title: `🎲 ${pilot} posted a Sabacc Result`,
      description: `\`\`\`\n${shareText}\n\`\`\`${
        siteUrl ? `\n👉 **[Beat This Run on the Holotable](${siteUrl})**` : ''
      }`,
      url: siteUrl || undefined,
      avatarUrl: resolveDiscordAvatarUrl(siteUrl),
      color: 0x38bdf8,
    });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  // --- Socket.IO Auth Gate & Rate Limiting --------------------------------

  const rateBuckets = new Map<string, { tokens: number; last: number }>();

  function withinRateLimit(socketId: string): boolean {
    const now = Date.now();
    const bucket = rateBuckets.get(socketId) ?? { tokens: RATE_BURST, last: now };
    bucket.tokens = Math.min(RATE_BURST, bucket.tokens + ((now - bucket.last) / 1000) * RATE_REFILL_PER_SEC);
    bucket.last = now;
    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;
    rateBuckets.set(socketId, bucket);
    return allowed;
  }

  io.use((socket, next) => {
    if (isSiteLocked()) {
      const sess = readAuthSessionFromCookieHeader(socket.handshake.headers.cookie);
      if (!sess) {
        next(new Error('AUTH_REQUIRED'));
        return;
      }
    }
    next();
  });

  io.on('connection', socket => {
    rememberOriginCandidate(
      socket.handshake.headers.origin,
      String(socket.handshake.headers['x-forwarded-proto'] || ''),
      String(socket.handshake.headers['x-forwarded-host'] || socket.handshake.headers.host || '')
    );
    socket.emit('lobbyUpdate', buildLobbySnapshot());

    let lastRateNotice = 0;
    socket.use((_event, next) => {
      if (!withinRateLimit(socket.id)) {
        const now = Date.now();
        if (now - lastRateNotice > 1000) {
          lastRateNotice = now;
          socket.emit('error', 'Too many actions. Slow down.');
        }
        next(new Error('rate limited'));
        return;
      }
      next();
    });

    socket.on(
      'createRoom',
      (payload?: { mode?: unknown; stakesTier?: unknown; dailyDateKey?: unknown; isPublic?: unknown }) => {
        if (Object.keys(games).length >= MAX_ROOMS) {
          socket.emit('joinRejected', { reason: 'The server is at capacity. Try again shortly.' });
          return;
        }

        const cfg = configStore.get();
        const roomId = generateRoomCode();
        const mode = validMode(payload?.mode);
        const stakesTier = validStakes(payload?.stakesTier, cfg.defaultStakes);
        const { game, rng } = createRoomState({
          roomId,
          mode,
          stakesTier,
          dailyDateKey: typeof payload?.dailyDateKey === 'string' ? payload.dailyDateKey : undefined,
        });

        game.isPublic = mode === 'party' ? payload?.isPublic !== false : false;
        if (cfg.lockCreditsGlobal && mode === 'party') {
          game.settings.lockedCredits = true;
        }

        games[roomId] = game;
        roomRngs.set(roomId, rng);

        scheduleNamed(
          roomId,
          'emptyTtl',
          () => {
            if (games[roomId] && games[roomId].players.length === 0) destroyRoom(roomId);
          },
          EMPTY_ROOM_TTL_MS
        );

        socket.emit('roomCreated', { roomId, mode });
      }
    );

    socket.on('joinRoom', ({ roomId, playerName, isSpectator, token, pilotKey, vaultCredits }) => {
      const code = normalizeRoomCode(roomId);
      if (!code) {
        socket.emit('joinRejected', { reason: 'Room codes are 4-6 letters or numbers.' });
        return;
      }

      const game = games[code];
      if (!game) {
        socket.emit('joinRejected', { reason: `Room ${code} no longer exists.` });
        return;
      }

      const existingSession = typeof token === 'string' ? sessionsByToken.get(token) : undefined;
      const rejoining =
        existingSession && existingSession.roomId === code
          ? game.players.find(p => p.id === existingSession.playerId)
          : undefined;

      socket.join(code);
      cancelNamed(code, 'emptyTtl');
      cancelNamed(code, 'roomReap');

      if (existingSession && rejoining) {
        sessionsBySocket.set(socket.id, existingSession);
        const scheduled = pendingRemoval.get(existingSession.playerId);
        if (scheduled) {
          clearTimeout(scheduled);
          pendingRemoval.delete(existingSession.playerId);
        }
        rejoining.isConnected = true;
        if (isSpectator !== undefined && game.mode === 'party') {
          rejoining.isSpectator = !!isSpectator;
          rejoining.isFolded =
            !!isSpectator || (game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN');
        }
        ensureHost(game);
        game.logs.push(`${rejoining.name} reconnected.`);
        trimLogs(game);
        socket.emit('session', {
          token: existingSession.token,
          playerId: existingSession.playerId,
          roomId: code,
        });
        broadcastRoom(code);
        broadcastLobby();
        return;
      }

      if (game.mode !== 'party' && game.players.some(p => !p.isAI)) {
        socket.emit('joinRejected', { reason: 'This table is a solo run.' });
        return;
      }

      if (game.players.length >= MAX_PLAYERS_PER_ROOM) {
        socket.emit('joinRejected', { reason: `Room ${code} is full.` });
        return;
      }

      const wasEmptyOfHumans = !game.players.some(p => !p.isAI);
      const forcePlayer = game.mode !== 'party';
      const spectating = forcePlayer ? false : !!isSpectator;
      const isMidGame = game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN';
      const minVaultStack = totalAnte(game.settings) * 4;
      const clampedVault =
        game.mode === 'quick_solo' && !configStore.get().lockCreditsGlobal
          ? clampInt(vaultCredits, minVaultStack, 250_000)
          : null;
      const initialCredits = clampedVault ?? game.settings.startingCredits;

      const authSess = readAuthSessionFromCookieHeader(socket.handshake.headers.cookie);
      const resolvedName = sanitizeName(
        playerName || authSess?.name,
        `Pilot ${game.players.length + 1}`
      );
      const resolvedPilotKey = authSess?.sub
        ? `oidc:${authSess.sub}`
        : typeof pilotKey === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(pilotKey)
          ? pilotKey
          : undefined;

      const player: Player = {
        id: randomUUID(),
        name: resolvedName,
        hand: [],
        credits: initialCredits,
        buyInTotal: initialCredits,
        contributed: 0,
        isFolded: spectating || isMidGame,
        isReady: spectating || forcePlayer,
        betThisRound: 0,
        isSpectator: spectating,
        isConnected: true,
        lastAction: null,
        pilotKey: resolvedPilotKey,
      };
      game.players.push(player);
      ensureHost(game);
      syncLedgerPlayer(game, player);

      const session: Session = { token: randomUUID(), roomId: code, playerId: player.id };
      sessionsByToken.set(session.token, session);
      sessionsBySocket.set(socket.id, session);

      game.logs.push(
        `${player.name} joined${spectating ? ' as spectator' : isMidGame ? ' (next hand)' : ''}.`
      );

      // Notify Discord when a new multiplayer table opens!
      const cfg = configStore.get();
      if (
        wasEmptyOfHumans &&
        game.mode === 'party' &&
        game.isPublic !== false &&
        cfg.discordWebhookUrl &&
        cfg.discordNotifyRoomCreate
      ) {
        const siteUrl = resolveSiteUrl();
        const joinLink = siteUrl ? `${siteUrl}/?room=${code}` : undefined;
        postDiscordEmbed(cfg.discordWebhookUrl, {
          title: `🛸 Sabacc Table Open — Room ${code}`,
          description: `**${player.name}** opened a **${game.settings.stakesTier.toUpperCase()}** table (${game.settings.ante}/${game.settings.sabaccAnte} CR ante).${
            joinLink
              ? `\n\n👉 **[Join Table ${code} Now](${joinLink})**`
              : `\nRoom Code: \`${code}\``
          }`,
          url: joinLink,
          avatarUrl: resolveDiscordAvatarUrl(siteUrl),
          color: 0xf59e0b,
        }).catch(() => {});
      }

      if (forcePlayer) {
        populateSoloBots(game, rngFor(code));
      }

      socket.emit('session', { token: session.token, playerId: player.id, roomId: code });

      if (forcePlayer && canStartHand(game)) {
        launchHand(game);
      }

      trimLogs(game);
      broadcastRoom(code);
      broadcastLobby();
    });

    socket.on(
      'updateTableSettings',
      (patch: {
        stakesTier?: unknown;
        tieRule?: unknown;
        turnSeconds?: unknown;
        lockedCredits?: unknown;
        isPublic?: unknown;
      }) => {
        const actor = resolveActor(socket.id);
        if (!actor) return;
        const { game, player } = actor;
        if (game.hostId !== player.id) {
          socket.emit('error', 'Only the table host can change table rules.');
          return;
        }
        if (game.mode === 'cantina_tour' || game.mode === 'daily_kessel') {
          socket.emit('error', 'Stakes are fixed in this challenge mode.');
          return;
        }
        if (game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN') {
          socket.emit('error', 'Finish the current hand before changing stakes.');
          return;
        }

        if (patch?.stakesTier) {
          const tier = validStakes(patch.stakesTier);
          const preset = STAKES_PRESETS[tier];
          game.settings.stakesTier = tier;
          game.settings.ante = preset.ante;
          game.settings.sabaccAnte = preset.sabaccAnte;
          game.settings.tableLimit = preset.tableLimit;
          game.settings.startingCredits = preset.startingCredits;
        }
        if (patch?.tieRule === 'split' || patch?.tieRule === 'blind_draw') {
          game.settings.tieRule = patch.tieRule as TieRule;
        }
        if (patch?.turnSeconds !== undefined) {
          const sec = clampInt(patch.turnSeconds, 0, 120);
          if (sec !== null) game.settings.turnSeconds = sec;
        }
        if (typeof patch?.lockedCredits === 'boolean' && !configStore.get().lockCreditsGlobal) {
          game.settings.lockedCredits = patch.lockedCredits;
        }
        if (typeof patch?.isPublic === 'boolean' && game.mode === 'party') {
          game.isPublic = patch.isPublic;
        }

        trimLogs(game);
        broadcastRoom(game.roomId);
        broadcastLobby();
      }
    );

    socket.on('updateCredits', ({ credits }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;

      if (game.settings.lockedCredits || configStore.get().lockCreditsGlobal) {
        socket.emit('error', 'Bankrolls are locked at this table.');
        return;
      }
      const amount = clampInt(credits, 0, MAX_CREDITS);
      if (amount === null) {
        socket.emit('error', 'Credits must be a number.');
        return;
      }
      if (game.currentPhase === 'JOINING' || game.currentPhase === 'SHOWDOWN') {
        const delta = amount - player.credits;
        player.credits = amount;
        player.buyInTotal += delta;
        syncLedgerPlayer(game, player);
        game.logs.push(`${player.name} adjusted stack to ${amount} CR.`);
        trimLogs(game);
        broadcastRoom(game.roomId);
      }
    });

    socket.on('addCredits', ({ amount }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;

      if (game.settings.lockedCredits || configStore.get().lockCreditsGlobal) {
        socket.emit('error', 'Re-buys are locked at this table.');
        return;
      }
      const buyIn = clampInt(amount, 1, MAX_BUY_IN);
      if (buyIn === null) {
        socket.emit('error', 'Buy-in must be a number.');
        return;
      }
      if (
        game.currentPhase !== 'JOINING' &&
        game.currentPhase !== 'SHOWDOWN' &&
        !player.isSpectator &&
        !player.isFolded
      ) {
        socket.emit('error', 'Cannot add credits mid-hand.');
        return;
      }
      const next = Math.min(MAX_CREDITS, player.credits + buyIn);
      const actualAdded = next - player.credits;
      player.credits = next;
      player.buyInTotal += actualAdded;
      syncLedgerPlayer(game, player);
      game.logs.push(`${player.name} bought in for +${actualAdded} CR.`);
      trimLogs(game);
      broadcastRoom(game.roomId);
    });

    socket.on('toggleSpectator', () => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      if (game.mode !== 'party') return;

      const isMidGame = game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN';
      if (!player.isSpectator && isMidGame) {
        player.isSpectator = true;
        player.isFolded = true;
        player.hand = [];
        game.logs.push(`${player.name} stepped back to spectate.`);
        if (game.players[game.turnIndex]?.id === player.id) {
          const nextPhase = applyBetAction(game, player.id, 'fold').nextPhase;
          onPhasePotentiallyChanged(game, game.currentPhase, nextPhase);
        }
      } else if (player.isSpectator) {
        player.isSpectator = false;
        player.isFolded = isMidGame;
        player.isReady = false;
        syncLedgerPlayer(game, player);
        game.logs.push(`${player.name} took a seat${isMidGame ? ' for next hand' : ''}.`);
      } else {
        player.isSpectator = true;
        player.isReady = true;
        player.isFolded = true;
        game.logs.push(`${player.name} is spectating.`);
      }
      trimLogs(game);
      broadcastRoom(game.roomId);
      broadcastLobby();
    });

    socket.on('ready', () => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;

      if (game.daily?.finished || game.tour?.runFailed || game.tour?.tourCompleted) {
        return;
      }
      const req = totalAnte(game.settings);
      if (!player.isSpectator && player.credits < req) {
        socket.emit('error', `Need at least ${req} CR to cover the ante.`);
        return;
      }
      player.isReady = true;
      if (canStartHand(game)) {
        launchHand(game);
      }
      broadcastRoom(game.roomId);
    });

    socket.on('startHandNow', () => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      if (game.hostId !== player.id) return;
      if (game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN') return;

      const eligible = game.players.filter(
        p => !p.isSpectator && isPresent(p) && p.credits >= totalAnte(game.settings)
      );
      if (eligible.length < 2) {
        socket.emit('error', 'Need at least 2 funded seats to deal.');
        return;
      }
      player.isReady = true;
      launchHand(game);
      broadcastRoom(game.roomId);
    });

    socket.on('advanceTourStage', () => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game } = actor;
      if (advanceCantinaTourStage(game, rngFor(game.roomId))) {
        launchHand(game);
        broadcastRoom(game.roomId);
      }
    });

    socket.on('addAI', (payload?: { skill?: unknown; personaId?: unknown }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game } = actor;
      if (game.mode === 'cantina_tour' || game.mode === 'daily_kessel') return;
      if (game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN') return;
      if (game.players.length >= MAX_PLAYERS_PER_ROOM) return;

      const skill: BotSkill | undefined =
        payload?.skill === 'novice' || payload?.skill === 'regular' || payload?.skill === 'shark'
          ? payload.skill
          : undefined;
      const personaId = typeof payload?.personaId === 'string' ? payload.personaId : undefined;

      addBotToGame(game, { skill, personaId }, rngFor(game.roomId));
      if (game.currentPhase === 'JOINING' && canStartHand(game)) {
        launchHand(game);
      }
      broadcastRoom(game.roomId);
      broadcastLobby();
    });

    socket.on('removeAI', ({ aiId }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game } = actor;
      if (game.mode === 'cantina_tour' || game.mode === 'daily_kessel') return;
      if (game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN') return;

      const index = game.players.findIndex(p => p.id === aiId && p.isAI);
      if (index !== -1) {
        const [removed] = game.players.splice(index, 1);
        if (game.dealerIndex >= game.players.length) game.dealerIndex = game.players.length - 1;
        game.logs.push(`${removed.name} left the table.`);
        trimLogs(game);
        broadcastRoom(game.roomId);
        broadcastLobby();
      }
    });

    socket.on('cardAction', ({ action, cardId }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      if (action !== 'draw' && action !== 'swap_deck' && action !== 'swap_discard' && action !== 'stand') {
        return;
      }
      const prevPhase = game.currentPhase;
      const res = applyCardAction(game, player.id, action, cardId, rngFor(game.roomId));
      if (!res.ok) {
        if (res.error) socket.emit('error', res.error);
        return;
      }
      onPhasePotentiallyChanged(game, prevPhase, res.nextPhase);
      broadcastRoom(game.roomId);
    });

    socket.on('betAction', ({ action, amount }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      if (
        action !== 'fold' &&
        action !== 'check' &&
        action !== 'call' &&
        action !== 'bet' &&
        action !== 'raise' &&
        action !== 'all_in'
      ) {
        return;
      }
      const prevPhase = game.currentPhase;
      const numAmount = amount !== undefined ? Number(amount) : undefined;
      const res = applyBetAction(game, player.id, action, numAmount, rngFor(game.roomId));
      if (!res.ok) {
        if (res.error) socket.emit('error', res.error);
        return;
      }
      onPhasePotentiallyChanged(game, prevPhase, res.nextPhase);
      broadcastRoom(game.roomId);
    });

    socket.on('skipTurn', () => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      if (game.hostId !== player.id) {
        socket.emit('error', 'Only the host can skip an inactive seat.');
        return;
      }
      const active = game.players[game.turnIndex];
      if (!active || active.isFolded) return;
      const prevPhase = game.currentPhase;
      let nextPhase = prevPhase;
      if (game.currentPhase === 'CARD') {
        game.logs.push(`Host stood for ${active.name}.`);
        nextPhase = applyCardAction(game, active.id, 'stand', undefined, rngFor(game.roomId)).nextPhase;
      } else if (game.currentPhase === 'BETTING') {
        const canCheck = game.currentBet <= active.betThisRound;
        game.logs.push(`Host ${canCheck ? 'checked' : 'folded'} for ${active.name}.`);
        nextPhase = applyBetAction(
          game,
          active.id,
          canCheck ? 'check' : 'fold',
          undefined,
          rngFor(game.roomId)
        ).nextPhase;
      }
      onPhasePotentiallyChanged(game, prevPhase, nextPhase);
      broadcastRoom(game.roomId);
    });

    socket.on('resetTable', () => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      if (game.hostId !== player.id) return;
      if (game.mode === 'cantina_tour' || game.mode === 'daily_kessel') return;

      clearGameFlowTimers(game.roomId);
      if (game.handPot > 0) {
        for (const p of game.players) {
          p.credits += p.contributed;
          p.contributed = 0;
          p.betThisRound = 0;
          syncLedgerPlayer(game, p);
        }
        game.handPot = 0;
        game.logs.push('Hand aborted by host — Hand Pot contributions refunded.');
      }
      for (const p of game.players) {
        p.hand = [];
        p.isFolded = !!p.isSpectator;
        p.isReady = !!(p.isAI || p.isSpectator);
      }
      game.currentPhase = 'JOINING';
      game.turnExpires = null;
      trimLogs(game);
      broadcastRoom(game.roomId);
      broadcastLobby();
    });

    socket.on('emote', ({ text }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      const clean = String(text ?? '').trim();
      if (!(QUICK_EMOTES as readonly string[]).includes(clean)) return;
      player.lastAction = { text: clean, tone: 'emote', timestamp: Date.now() };
      broadcastRoom(game.roomId);
    });

    socket.on('chatMessage', ({ text }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;

      const raw = String(text ?? '')
        .replace(/[\p{Cc}\p{Cf}]/gu, '')
        .trim()
        .slice(0, MAX_CHAT_LENGTH);
      const message = filterProfanity(raw);
      if (!message) return;

      game.messages.push({
        sender: player.name,
        text: message,
        timestamp: Date.now(),
      });
      if (game.messages.length > 50) game.messages.shift();
      broadcastRoom(game.roomId);
    });

    socket.on('reportPlayer', ({ targetName, reason }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      const cleanTarget = String(targetName ?? '').trim().slice(0, MAX_NAME_LENGTH);
      if (!cleanTarget) return;
      recentReports.push({
        id: randomUUID(),
        roomId: game.roomId,
        reporterName: player.name,
        reportedName: cleanTarget,
        reason: String(reason ?? 'Disruptive conduct').trim().slice(0, 120),
        timestamp: Date.now(),
      });
      if (recentReports.length > 100) recentReports.shift();
    });

    socket.on('disconnect', () => {
      rateBuckets.delete(socket.id);
      const session = sessionsBySocket.get(socket.id);
      sessionsBySocket.delete(socket.id);
      if (!session) return;

      const roomId = session.roomId;
      const game = games[roomId];
      if (!game) return;

      const index = game.players.findIndex(p => p.id === session.playerId);
      if (index === -1) return;
      const player = game.players[index];

      player.isConnected = false;
      ensureHost(game);

      if (game.currentPhase === 'JOINING') {
        game.logs.push(`${player.name} lost connection.`);
        pendingRemoval.set(
          player.id,
          setTimeout(() => {
            pendingRemoval.delete(player.id);
            const current = games[roomId];
            if (!current) return;
            const at = current.players.findIndex(p => p.id === session.playerId);
            if (at === -1 || current.players[at].isConnected) return;
            current.players.splice(at, 1);
            sessionsByToken.delete(session.token);
            ensureHost(current);
            current.logs.push(`${player.name} left the room.`);
            trimLogs(current);
            broadcastRoom(roomId);
            broadcastLobby();
          }, ROOM_GRACE_PERIOD_MS)
        );
      } else {
        game.logs.push(`${player.name} disconnected.`);
        if (game.players[game.turnIndex]?.id === player.id) {
          const prevPhase: GameState['currentPhase'] = game.currentPhase;
          let nextPhase: GameState['currentPhase'] = prevPhase;
          if (game.currentPhase === 'CARD') {
            player.isFolded = true;
            nextPhase = applyCardAction(game, player.id, 'stand', undefined, rngFor(roomId)).nextPhase;
          } else if (game.currentPhase === 'BETTING') {
            nextPhase = applyBetAction(game, player.id, 'fold', undefined, rngFor(roomId)).nextPhase;
          }
          onPhasePotentiallyChanged(game, prevPhase, nextPhase);
        }
      }

      const liveHumans = game.players.filter(p => !p.isAI && p.isConnected);
      if (liveHumans.length === 0) {
        scheduleNamed(
          roomId,
          'roomReap',
          () => {
            if (games[roomId]?.players.some(p => !p.isAI && p.isConnected)) return;
            destroyRoom(roomId);
          },
          ROOM_GRACE_PERIOD_MS
        );
      }

      trimLogs(game);
      broadcastRoom(roomId);
      broadcastLobby();
    });
  });

  if (staticDir) {
    expressApp.use(express.static(staticDir, { extensions: ['html'] }));
    expressApp.get(/.*/, (_req, res) => {
      res.sendFile(join(staticDir, 'index.html'));
    });
  } else {
    const next = (await import('next')).default;
    const app = next({ dev });
    const handle = app.getRequestHandler();
    await app.prepare();
    expressApp.all(/.*/, (req, res) => {
      const parsedUrl = parse(req.url!, true);
      handle(req, res, parsedUrl);
    });
  }

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    for (const address of localAddresses()) {
      console.log(`> On your network: http://${address}:${port}`);
    }
  });

  // Graceful container shutdown on SIGTERM / SIGINT
  const shutdown = (signal: string) => {
    console.log(`> Received ${signal}, shutting down holotable gracefully...`);
    for (const roomId of Object.keys(games)) {
      for (const handle of roomNamedTimers.get(roomId)?.values() ?? []) clearTimeout(handle);
    }
    for (const handle of pendingRemoval.values()) clearTimeout(handle);
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

function localAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((info): info is NetworkInterfaceInfo => !!info && info.family === 'IPv4' && !info.internal)
    .map(info => info.address);
}

bootstrap().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
