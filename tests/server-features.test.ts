import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseCookies, verifySignedToken } from '../lib/auth';
import { isLoopbackOrPackagedHost, normalizeBaseUrl } from '../lib/api-base';
import { getDailyBounties, getRepProgress } from '../lib/bounties';
import { analyzeZeroOuts, Card, CardSuit, CardType, ClientGameState, evaluateHand } from '../lib/game-logic';
import { LocalGameTransport } from '../lib/local-transport';
import { filterCallsign, filterProfanity } from '../lib/moderation';
import { PilotRegistryStore } from '../lib/pilot-registry';
import { claimDailyStipend, defaultDossier, settleShowdownToDossier } from '../lib/progression';
import { encodeQrMatrix } from '../lib/qr';
import { hashPassword, ServerConfigStore, verifyPassword } from '../lib/server-config';

const makeCard = (id: string, value: number, suit = CardSuit.CIRCLE): Card => ({
  id,
  value,
  type: value === 0 ? CardType.SYLOP : value > 0 ? CardType.POSITIVE : CardType.NEGATIVE,
  suit: value === 0 ? CardSuit.NONE : suit,
});

test('ServerConfigStore hashes passwords with scrypt and persists settings to CONFIG_DIR', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sabacc-cfg-'));
  try {
    const hash = hashPassword('corellian-secret');
    assert.equal(verifyPassword('corellian-secret', hash), true);
    assert.equal(verifyPassword('wrong-password', hash), false);

    const store = new ServerConfigStore(dir);
    store.update({
      newSitePassword: 'cantina-gate',
      serverNotice: 'Sabacc Friday!',
      publicLobby: false,
      lockCreditsGlobal: true,
    });

    const reloaded = new ServerConfigStore(dir);
    assert.equal(verifyPassword('cantina-gate', reloaded.get().sitePasswordHash), true);
    assert.equal(reloaded.get().serverNotice, 'Sabacc Friday!');
    assert.equal(reloaded.get().publicLobby, false);
    assert.equal(reloaded.get().lockCreditsGlobal, true);

    const redacted = reloaded.getRedactedForAdmin();
    assert.equal(redacted.hasSitePassword, true);
    assert.equal('sitePasswordHash' in redacted, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cookie parser and signed token verifier reject tampered tokens', () => {
  const parsed = parseCookies('foo=bar; sabacc_auth=abc.def');
  assert.equal(parsed.foo, 'bar');
  assert.equal(parsed.sabacc_auth, 'abc.def');
  assert.equal(verifySignedToken('abc.def'), null);
});

test('LocalGameTransport runs standalone offline solo games and honors persistent vaultCredits', async () => {
  const transport = new LocalGameTransport({
    mode: 'quick_solo',
    stakesTier: 'medium',
  });

  try {
    const firstState = await new Promise<ClientGameState>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('local transport timeout')), 2000);
      transport.on('connect', () => {
        transport.emit('joinRoom', { playerName: 'Offline Han', vaultCredits: 1850 });
      });
      transport.on('gameStateUpdate', (s: ClientGameState) => {
        if (s.currentPhase === 'CARD') {
          clearTimeout(t);
          resolve(s);
        }
      });
    });

    assert.equal(firstState.roomId, 'LOCAL');
    assert.equal(firstState.players.length, 4, 'human + 3 offline personas seated');
    assert.equal(firstState.players[0].name, 'Offline Han');
    // 1850 starting vault minus 10 hand ante + 5 sabacc ante = 1835:
    assert.equal(firstState.players[0].credits, 1835);
    assert.equal(firstState.players[0].hand.length, 2);
    assert.equal(firstState.players[1].hand[0].hidden, true, 'bot cards redacted in local transport too');
  } finally {
    transport.disconnect();
  }
});

test('claimDailyStipend escalates consecutive daily login streaks and prevents double-claiming', () => {
  let d = defaultDossier();
  const day1 = claimDailyStipend(d, '2026-11-24');
  assert.equal(day1.claimed, true);
  assert.equal(day1.streak, 1);
  assert.equal(day1.rewardCredits, 150);
  assert.equal(day1.dossier.vaultCredits, 1150);

  const dup = claimDailyStipend(day1.dossier, '2026-11-24');
  assert.equal(dup.claimed, false);
  assert.equal(dup.dossier.vaultCredits, 1150);

  const day2 = claimDailyStipend(day1.dossier, '2026-11-25');
  assert.equal(day2.claimed, true);
  assert.equal(day2.streak, 2);
  assert.equal(day2.rewardCredits, 200);
  assert.equal(day2.dossier.vaultCredits, 1350);

  // Skipping a day resets consecutive streak back to 1:
  const skipped = claimDailyStipend(day2.dossier, '2026-11-28');
  assert.equal(skipped.streak, 1);
});

test('settleShowdownToDossier tracks honest careerNet, creditHistory, bounties, and Hutt bailouts', () => {
  const dateKey = '2026-11-25';
  const bounties = getDailyBounties(dateKey);
  assert.equal(bounties.length, 3);

  const myHand = [makeCard('c1', 5), makeCard('c2', -5)];
  const ev = evaluateHand(myHand);

  const mockShowdownState = {
    roomId: 'TEST1',
    hostId: 'me',
    mode: 'quick_solo',
    settings: {
      stakesTier: 'medium',
      ante: 10,
      sabaccAnte: 5,
      tableLimit: 1000,
      tieRule: 'split',
      turnSeconds: 0,
      lockedCredits: false,
      startingCredits: 1000,
    },
    players: [
      {
        id: 'me',
        name: 'Han',
        hand: myHand,
        credits: 1180,
        buyInTotal: 1000,
        contributed: 40,
        isFolded: false,
        isReady: false,
        betThisRound: 0,
      },
      {
        id: 'bot1',
        name: 'Lando',
        personaId: 'lando',
        isAI: true,
        hand: [makeCard('c3', 4), makeCard('c4', -2)],
        credits: 820,
        buyInTotal: 1000,
        contributed: 40,
        isFolded: false,
        isReady: true,
        betThisRound: 0,
      },
    ],
    discardPile: [],
    deckCount: 54,
    handPot: 0,
    sabaccPot: 0,
    currentRound: 3,
    gamesPlayed: 1,
    currentPhase: 'SHOWDOWN',
    turnIndex: 0,
    dealerIndex: 0,
    currentBet: 0,
    minRaise: 10,
    bettingLapComplete: true,
    turnExpires: null,
    lastDiceRoll: [3, 3],
    shiftPending: false,
    shiftTriggered: false,
    winnerId: 'me',
    winnerIds: ['me'],
    showdownResult: {
      standings: [
        { playerId: 'me', name: 'Han', hand: myHand, evaluation: ev, netDelta: 185, isWinner: true },
      ],
      payouts: [
        { label: 'Main Pot', winnerIds: ['me'], winnerNames: ['Han'], amount: 160, split: false },
        { label: 'Sabacc Pot', winnerIds: ['me'], winnerNames: ['Han'], amount: 65, split: false },
      ],
      sabaccPotCarried: false,
      blindDrawRounds: [],
      netByPlayer: { me: 180, bot1: -180 },
    },
    ledger: {},
    tour: null,
    daily: null,
    logs: [],
    messages: [],
  } as ClientGameState;

  const settled = settleShowdownToDossier(defaultDossier(), mockShowdownState, 'me', dateKey);
  assert.equal(settled.changed, true);
  assert.equal(settled.handDelta, 180);
  assert.equal(settled.dossier.careerNetCredits, 180);
  assert.equal(settled.dossier.creditHistory.length, 1);
  assert.equal(settled.dossier.creditHistory[0].delta, 180);
  assert.equal(settled.dossier.dailyNetByDate[dateKey]?.net, 180);
  assert.equal(settled.dossier.rivals.lando?.winsAgainst, 1);
  assert.ok(getRepProgress(settled.dossier.repXp).xp >= 95);

  // Verify Hutt Credit Line bailout restores broke vault to 300 CR without faking careerNetCredits:
  const brokeDossier = { ...settled.dossier, vaultCredits: 40 };
  const bustState: ClientGameState = {
    ...mockShowdownState,
    gamesPlayed: 2,
    winnerId: 'bot1',
    winnerIds: ['bot1'],
    players: [
      { ...mockShowdownState.players[0], credits: 10 },
      mockShowdownState.players[1],
    ],
    showdownResult: {
      ...mockShowdownState.showdownResult!,
      payouts: [{ label: 'Main Pot', winnerIds: ['bot1'], winnerNames: ['Lando'], amount: 60, split: false }],
      netByPlayer: { me: -30, bot1: 30 },
    },
  };
  const bailed = settleShowdownToDossier(brokeDossier, bustState, 'me', dateKey);
  assert.equal(bailed.bailoutGranted, true);
  assert.equal(bailed.dossier.vaultCredits, 300, 'vault restored to 300 CR so player is never soft-locked');
  assert.equal(bailed.dossier.careerNetCredits, 150, 'honest careerNet still reflects -30 CR loss');
});

test('analyzeZeroOuts counts public unseen cards accurately and PilotRegistryStore persists standings', () => {
  const hint = analyzeZeroOuts([makeCard('1', 6), makeCard('2', -2)], makeCard('d', -4));
  // Hand sum is +4 -> needs -4 to draw to 0. One -4 is on top of discard, so 2 of 3 remain live!
  assert.ok(hint);
  assert.equal(hint.label, 'DRAW -4 → SABACC');
  assert.equal(hint.liveOuts, 2);

  const dir = mkdtempSync(join(tmpdir(), 'sabacc-pilots-'));
  try {
    const reg = new PilotRegistryStore(dir);
    reg.recordHand({
      rawPilotKey: 'pilot-alpha-12345',
      callsign: 'Han Solo',
      netDelta: 140,
      won: true,
      wonSabaccPot: true,
      potWon: 180,
      dailyFinished: { dateKey: '2026-11-25', finalCredits: 590, net: 340 },
    });
    reg.recordHand({
      rawPilotKey: 'pilot-beta-67890',
      callsign: 'Qi-ra',
      netDelta: -45,
      won: false,
      wonSabaccPot: false,
      potWon: 0,
    });

    const reloaded = new PilotRegistryStore(dir);
    const leaders = reloaded.getLeaderboard();
    assert.equal(leaders.length, 2);
    assert.equal(leaders[0].callsign, 'Han Solo');
    assert.equal(leaders[0].careerNet, 140);
    assert.equal(leaders[1].callsign, 'Qi-ra');
    assert.equal(leaders[1].careerNet, -45);

    const daily = reloaded.getDailyLeaderboard('2026-11-25');
    assert.equal(daily.length, 1);
    assert.equal(daily[0].finalCredits, 590);

    // App Store data-erasure compliance: deletePilot removes pilot record permanently
    assert.equal(reloaded.deletePilot('pilot-alpha-12345'), true);
    assert.equal(new PilotRegistryStore(dir).getLeaderboard().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('UGC moderation masks profanity in chat and sanitizes offensive callsigns', () => {
  assert.equal(filterProfanity('gg what a shit draw'), 'gg what a **** draw');
  assert.equal(filterCallsign('fuck', 'Pilot'), 'Pilot');
  assert.equal(filterCallsign('Lando', 'Pilot'), 'Lando');
});

test('API base normalizer and QR encoder handle configured mobile/custom-domain invite URLs', () => {
  assert.equal(normalizeBaseUrl('sabacc.example.com:3000/'), 'http://sabacc.example.com:3000');
  assert.equal(normalizeBaseUrl('https://sabacc.example.com///'), 'https://sabacc.example.com');
  assert.equal(normalizeBaseUrl('   '), '');
  assert.equal(isLoopbackOrPackagedHost('localhost'), true);
  assert.equal(isLoopbackOrPackagedHost('127.0.0.1'), true);
  assert.equal(isLoopbackOrPackagedHost('sabacc.example.com'), false);

  const customDomainInvite = 'https://sabacc.my-cantina-holonet-server.example.com/?room=KSL94';
  const matrixV4 = encodeQrMatrix(customDomainInvite);
  assert.ok(matrixV4);
  assert.equal(matrixV4.length, 33, '64-byte custom domain uses QR Version 4-L (33x33)');

  const longTunnelInvite =
    'https://sabacc-corellian-spike-cantina-holotable-tunnel.my-homelab-cluster.example.com/?room=KSL94';
  const matrixV5 = encodeQrMatrix(longTunnelInvite);
  assert.ok(matrixV5, 'QR encoder supports long custom domain URLs up to 106 bytes');
  assert.equal(matrixV5.length, 37, '98-byte custom domain uses QR Version 5-L (37x37)');
});
