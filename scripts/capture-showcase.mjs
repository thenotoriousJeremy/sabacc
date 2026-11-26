/**
 * Captures 3 real straight-on @3x mobile screenshots (390x844 -> 1170x2532) of the live
 * running Sabacc app across Light Mode + multiple table/card themes using local headless
 * Chrome via CDP, then composites them straight-on with sleek overlapping depth into
 * `screenshots/mobile-showcase.png`.
 *
 * Zero AI image generation — 100% real rendered UI pixels.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { io } from 'socket.io-client';

const ROOT = process.cwd();
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chromeBin = CHROME_PATHS.find(p => existsSync(p));
if (!chromeBin) {
  throw new Error('Could not locate Chrome or Edge binary for headless screenshot capture.');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res(), { once: true });
      this.ws.addEventListener('error', e => rej(e), { once: true });
    });
    this.ws.addEventListener('message', evt => {
      const msg = JSON.parse(String(evt.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: ok, reject: fail } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) fail(new Error(msg.error.message));
        else ok(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

function buildSeededDossier(todayKey, overrides = {}) {
  const deltas = [
    45, -15, 110, 85, -30, 195, -15, 140, 60, -45, 240, 95, -20, 175,
    130, -35, 310, 80, -15, 220, -40, 165, 125, -25, 285, 90, -15, 225,
  ];
  const ranks = [
    'Sabacc (Pair)', 'Folded', 'Rule of Two', 'Nulrhek (+1)', 'Nulrhek (-2)',
    'Yee-Haa', 'Folded', 'Sabacc (Pair)', 'Sabacc', 'Nulrhek (+3)',
    'Banthas Wild', 'Sabacc (Pair)', 'Folded', 'Straight Khyron',
    'Sabacc (Pair)', 'Nulrhek (-1)', 'Full Sabacc', 'Sabacc', 'Folded',
    'Rhylet', 'Nulrhek (+2)', 'Sabacc (Pair)', 'Rule of Two', 'Folded',
    'Yee-Haa', 'Sabacc', 'Folded', 'Pure Sabacc',
  ];
  let vault = 1000;
  let net = 0;
  const now = Date.now();
  const creditHistory = deltas.map((d, i) => {
    vault += d;
    net += d;
    return {
      ts: now - (deltas.length - i) * 3600_000,
      vault,
      careerNet: net,
      delta: d,
      mode: i % 4 === 0 ? 'cantina_tour' : 'quick_solo',
      rankName: ranks[i % ranks.length],
    };
  });

  return {
    pilotKey: 'showcase-han-solo-key',
    callsign: 'HAN SOLO',
    vaultCredits: vault,
    careerNetCredits: net,
    peakVaultCredits: vault + 40,
    bailoutsCount: 0,
    repXp: 2680,
    loginStreak: 5,
    bestLoginStreak: 9,
    lastStipendDate: '2026-11-24',
    handsPlayed: 46,
    handsWon: 29,
    sabaccPotsWon: 8,
    shiftsSurvived: 11,
    biggestPotWon: 420,
    currentStreak: 3,
    bestStreak: 6,
    cantinaHighestStage: 5,
    cantinaTitlesWon: 1,
    codex: {
      pure_sabacc: { count: 1, firstAt: now - 800000 },
      full_sabacc: { count: 1, firstAt: now - 700000 },
      yee_haa: { count: 2, firstAt: now - 600000 },
      rhylet: { count: 2, firstAt: now - 500000 },
      straight_khyron: { count: 3, firstAt: now - 400000 },
      banthas_wild: { count: 4, firstAt: now - 300000 },
      rule_of_two: { count: 5, firstAt: now - 250000 },
      sabacc_pair: { count: 11, firstAt: now - 200000 },
      sabacc: { count: 8, firstAt: now - 150000 },
      nulrhek: { count: 9, firstAt: now - 100000 },
    },
    dailyBestByDate: {
      [todayKey]: {
        finalCredits: 640,
        net: 390,
        shareText: `SABACC • DAILY KESSEL RUN ${todayKey}\nStack: 640 CR (+390 CR) • ★★★ PARSEC RECORD`,
      },
    },
    creditHistory,
    dailyNetByDate: {
      '2026-11-21': { net: 310, hands: 8, wins: 5 },
      '2026-11-22': { net: -65, hands: 5, wins: 2 },
      '2026-11-23': { net: 540, hands: 11, wins: 7 },
      '2026-11-24': { net: 795, hands: 12, wins: 8 },
      [todayKey]: { net: 900, hands: 10, wins: 7 },
    },
    bountiesByDate: {
      [todayKey]: {
        progress: { zero_lock: 2, specialty_hunter: 1, shift_survivor: 1, table_grinder: 4 },
        completedIds: ['zero_lock', 'specialty_hunter'],
        sweepClaimed: false,
      },
    },
    rivals: {
      lando: { name: 'Lando Calrissian', hands: 22, winsAgainst: 13, lossesTo: 9 },
      qira: { name: "Qi'ra", hands: 18, winsAgainst: 11, lossesTo: 7 },
    },
    selectedFelt: 'corellian-teal',
    selectedCardBack: 'beskar-steel',
    selectedDice: 'brass-aurebesh',
    colorMode: 'dark',
    volume: 0,
    ambientHum: false,
    haptics: false,
    chatEnabled: true,
    tutorialCompleted: true,
    ...overrides,
  };
}

function buildCompositeHtml(shotLightHomeB64, shotDarkTableB64, shotThemesB64) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1520px;
    height: 980px;
    overflow: hidden;
    background-color: #05080e;
    background-image:
      radial-gradient(ellipse 36% 52% at 24% 52%, rgba(251, 191, 36, 0.14) 0%, transparent 72%),
      radial-gradient(ellipse 42% 58% at 50% 48%, rgba(34, 211, 238, 0.22) 0%, transparent 74%),
      radial-gradient(ellipse 36% 52% at 77% 52%, rgba(217, 70, 239, 0.14) 0%, transparent 72%),
      repeating-linear-gradient(0deg, rgba(255,255,255,0.014) 0px, rgba(255,255,255,0.014) 1px, transparent 1px, transparent 4px);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 34px 40px 32px;
    position: relative;
  }
  .reticle {
    position: absolute;
    inset: 0;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.11;
  }
  .header {
    text-align: center;
    z-index: 5;
  }
  .kicker {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 12px;
    letter-spacing: 0.4em;
    color: #67e8f9;
    text-transform: uppercase;
  }
  /* Overlapping Straight-On 3-Phone Stage */
  .stage {
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    margin: auto 0;
  }
  .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    position: relative;
  }
  .col.left {
    z-index: 2;
    margin-right: -36px;
    transform: translateY(12px);
  }
  .col.hero {
    z-index: 4;
    transform: translateY(-10px);
  }
  .col.right {
    z-index: 2;
    margin-left: -36px;
    transform: translateY(12px);
  }

  /* Precision Straight-On Smartphone Chassis */
  .phone {
    position: relative;
    width: 356px;
    height: 744px;
    border-radius: 52px;
    padding: 11px;
    background: linear-gradient(145deg, #2d3748 0%, #131924 48%, #090d14 100%);
    box-shadow:
      0 0 0 1.5px rgba(148, 163, 184, 0.34),
      inset 0 0 0 1.5px rgba(15, 23, 42, 0.95),
      0 32px 72px rgba(0, 0, 0, 0.85);
  }
  /* Brushed Beskar Titanium Bezel for Light Mode Phone */
  .col.left .phone {
    background: linear-gradient(145deg, #cbd5e1 0%, #64748b 48%, #334155 100%);
    box-shadow:
      0 0 0 1.5px rgba(248, 250, 252, 0.55),
      inset 0 0 0 1.5px rgba(15, 23, 42, 0.7),
      0 32px 72px rgba(0, 0, 0, 0.85),
      0 0 44px rgba(56, 189, 248, 0.14);
  }
  /* Elevated Center Hero Phone casting crisp depth shadow over overlapped side phones */
  .col.hero .phone {
    width: 386px;
    height: 802px;
    border-radius: 56px;
    padding: 12px;
    box-shadow:
      0 0 0 2px rgba(251, 191, 36, 0.55),
      inset 0 0 0 1.5px rgba(15, 23, 42, 0.95),
      -28px 24px 65px rgba(0, 0, 0, 0.92),
      28px 24px 65px rgba(0, 0, 0, 0.92),
      0 42px 90px rgba(0, 0, 0, 0.95),
      0 0 65px rgba(34, 211, 238, 0.2);
  }
  .phone::before {
    content: "";
    position: absolute;
    left: -3px;
    top: 138px;
    width: 3px;
    height: 48px;
    border-radius: 2px 0 0 2px;
    background: #475569;
    box-shadow: 0 62px 0 #475569;
  }
  .phone::after {
    content: "";
    position: absolute;
    right: -3px;
    top: 172px;
    width: 3px;
    height: 72px;
    border-radius: 0 2px 2px 0;
    background: #475569;
  }
  .screen {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 41px;
    overflow: hidden;
    background: #05070b;
    display: flex;
    flex-direction: column;
  }
  .col.left .screen {
    background: #d5dde7;
  }
  .col.hero .screen {
    border-radius: 44px;
  }
  .statusbar {
    position: relative;
    height: 32px;
    flex-shrink: 0;
    background: #05080e;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 22px 0;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-size: 11px;
    font-weight: 600;
    color: rgba(248, 250, 252, 0.85);
    z-index: 5;
  }
  .statusbar.light {
    background: #e3e9f1;
    color: #090e17;
  }
  .statusbar .icons {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .screen img {
    width: 100%;
    flex: 1;
    min-height: 0;
    object-fit: cover;
    object-position: top center;
    display: block;
  }
  .island {
    position: absolute;
    top: 7px;
    left: 50%;
    transform: translateX(-50%);
    width: 76px;
    height: 19px;
    border-radius: 999px;
    background: #05070b;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
  }
  .island::after {
    content: "";
    position: absolute;
    right: 11px;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: radial-gradient(circle, #1e3a8a 0%, #090d16 70%);
  }
  .homebar {
    position: absolute;
    bottom: 6px;
    left: 50%;
    transform: translateX(-50%);
    width: 108px;
    height: 4px;
    border-radius: 999px;
    background: rgba(255,255,255,0.34);
    z-index: 5;
  }
  .col.left .homebar {
    background: rgba(15, 23, 42, 0.32);
  }
  .caption {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 15px;
    border: 1px solid rgba(56, 189, 248, 0.28);
    background: rgba(8, 13, 20, 0.9);
    clip-path: polygon(7px 0, calc(100% - 7px) 0, 100% 7px, 100% calc(100% - 7px), calc(100% - 7px) 100%, 7px 100%, 0 calc(100% - 7px), 0 7px);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #e2e8f0;
  }
  .col.left .caption {
    border-color: rgba(251, 191, 36, 0.45);
    color: #fef3c7;
  }
  .col.hero .caption {
    border-color: rgba(34, 211, 238, 0.5);
    color: #a5f3fc;
  }
  .col.right .caption {
    border-color: rgba(232, 121, 249, 0.45);
    color: #f5d0fe;
  }
  .dot {
    width: 6px;
    height: 6px;
    transform: rotate(45deg);
    background: #22d3ee;
  }
  .col.left .dot { background: #fbbf24; }
  .col.right .dot { background: #e879f9; }
</style>
</head>
<body>
  <div class="reticle">
    <svg width="920" height="920" viewBox="0 0 400 400">
      <circle cx="200" cy="200" r="190" fill="none" stroke="#22d3ee" stroke-width="0.6" stroke-dasharray="3 7" />
      <circle cx="200" cy="200" r="150" fill="none" stroke="#fbbf24" stroke-width="0.5" />
      <polygon points="200,20 380,200 200,380 20,200" fill="none" stroke="#22d3ee" stroke-width="0.5" />
    </svg>
  </div>

  <div class="header">
    <div class="kicker">CORELLIAN SPIKE SABACC // LIGHT DATA-SLATE, DARK HOLOTABLE &amp; UNLOCKABLE THEMES</div>
  </div>

  <div class="stage">
    <div class="col left">
      <div class="phone">
        <div class="screen">
          <div class="statusbar light">
            <span>9:41</span>
            <div class="island"></div>
            <span class="icons">5G ▮</span>
          </div>
          <img src="data:image/png;base64,${shotLightHomeB64}" alt="Bespin Ivory Light Mode Console" />
          <div class="homebar"></div>
        </div>
      </div>
      <div class="caption"><span class="dot"></span> Beskar Titanium Light Mode</div>
    </div>

    <div class="col hero">
      <div class="phone">
        <div class="screen">
          <div class="statusbar">
            <span>9:41</span>
            <div class="island"></div>
            <span class="icons">5G ▮</span>
          </div>
          <img src="data:image/png;base64,${shotDarkTableB64}" alt="Corellian Shipyard Dark Holotable" />
          <div class="homebar"></div>
        </div>
      </div>
      <div class="caption"><span class="dot"></span> Corellian Dark Holotable</div>
    </div>

    <div class="col right">
      <div class="phone">
        <div class="screen">
          <div class="statusbar">
            <span>9:41</span>
            <div class="island"></div>
            <span class="icons">5G ▮</span>
          </div>
          <img src="data:image/png;base64,${shotThemesB64}" alt="Unlockable Felts & Deck Skins" />
          <div class="homebar"></div>
        </div>
      </div>
      <div class="caption"><span class="dot"></span> 6 Table Felts &amp; 5 Decks</div>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  const port = 39415;
  const todayKey = new Date().toISOString().slice(0, 10);
  const tmpConfigDir = mkdtempSync(join(tmpdir(), 'sabacc-shot-cfg-'));
  const tmpChromeDir = mkdtempSync(join(tmpdir(), 'sabacc-shot-chr-'));

  writeFileSync(
    join(tmpConfigDir, 'config.json'),
    JSON.stringify({ publicLobby: true, serverNotice: '' }, null, 2),
    'utf8'
  );

  const serverProc = spawn(process.execPath, [resolve(ROOT, 'dist/server.cjs')], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      STATIC_DIR: resolve(ROOT, 'out'),
      CONFIG_DIR: tmpConfigDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let hostSock1 = null;
  let hostSock2 = null;
  let chromeProc = null;

  try {
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`${baseUrl}/healthz`);
        if (r.ok) break;
      } catch {}
      await sleep(150);
    }

    const openSeededPartyRoom = (hostName, stakesTier) =>
      new Promise(res => {
        const s = io(baseUrl, { forceNew: true });
        s.on('connect', () => s.emit('createRoom', { mode: 'party', stakesTier, isPublic: true }));
        s.on('roomCreated', ({ roomId }) => {
          s.emit('joinRoom', { roomId, playerName: hostName, isSpectator: false });
          s.once('gameStateUpdate', () => {
            s.emit('addAI', { skill: 'shark' });
            setTimeout(() => res(s), 120);
          });
        });
      });

    hostSock1 = await openSeededPartyRoom('Lando', 'high');
    hostSock2 = await openSeededPartyRoom("Qi'ra", 'medium');

    const debugPort = 49226;
    chromeProc = spawn(
      chromeBin,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        `--user-data-dir=${tmpChromeDir}`,
        `--remote-debugging-port=${debugPort}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let pageWsUrl = null;
    for (let i = 0; i < 40; i++) {
      try {
        const listResp = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
        if (listResp.ok) {
          const pages = await listResp.json();
          const target = pages.find(p => p.type === 'page' && p.webSocketDebuggerUrl);
          if (target) {
            pageWsUrl = target.webSocketDebuggerUrl;
            break;
          }
        }
      } catch {}
      await sleep(150);
    }
    if (!pageWsUrl) throw new Error('Could not connect to headless Chrome CDP target.');

    const cdp = new CdpSession(pageWsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 804,
      deviceScaleFactor: 3,
      mobile: true,
    });

    // 1. Capture Left Phone: Bespin Ivory LIGHT MODE Home Console
    const lightDossier = buildSeededDossier(todayKey, { colorMode: 'light' });
    await cdp.send('Page.navigate', { url: baseUrl });
    await sleep(900);
    await cdp.send('Runtime.evaluate', {
      expression: `localStorage.setItem('sabacc:pilotDossier:v1', ${JSON.stringify(JSON.stringify(lightDossier))});`,
    });
    await cdp.send('Page.reload', {});
    await sleep(1400);
    await cdp.send('Runtime.evaluate', {
      expression: 'document.fonts ? document.fonts.ready : Promise.resolve()',
      awaitPromise: true,
    });
    await sleep(350);
    const shotLightHome = await cdp.send('Page.captureScreenshot', { format: 'png' });

    // 2. Switch to Dark Mode + Canto/Beskar unlocked Dossier -> Capture Right Phone: Table & Deck Themes (`Skins` tab)
    const darkDossier = buildSeededDossier(todayKey, {
      colorMode: 'dark',
      selectedFelt: 'corellian-teal',
      selectedCardBack: 'halcyon-holo',
    });
    await cdp.send('Runtime.evaluate', {
      expression: `localStorage.setItem('sabacc:pilotDossier:v1', ${JSON.stringify(JSON.stringify(darkDossier))});`,
    });
    await cdp.send('Page.reload', {});
    await sleep(1200);

    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const profileBtn = document.querySelector('button[aria-label="Open Pilot Profile and Credits"]');
          if (profileBtn) profileBtn.click();
        })()
      `,
    });
    await sleep(450);
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const skinsBtn = [...document.querySelectorAll('button')].find(b => b.textContent && b.textContent.includes('Skins'));
          if (skinsBtn) skinsBtn.click();
        })()
      `,
    });
    await sleep(600);
    const shotThemes = await cdp.send('Page.captureScreenshot', { format: 'png' });

    // 3. Close Profile, click Play Sabacc -> Capture Center Hero Phone: Live Full-Bleed Cantina Table
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const closeBtn = document.querySelector('button[aria-label="Close Profile"]');
          if (closeBtn) closeBtn.click();
        })()
      `,
    });
    await sleep(400);

    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const playBtn = [...document.querySelectorAll('button')].find(b => b.textContent && b.textContent.includes('Play Sabacc'));
          if (playBtn) playBtn.click();
        })()
      `,
    });

    for (let attempt = 0; attempt < 25; attempt++) {
      await sleep(350);
      const check = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const text = document.body.innerText || '';
            return text.includes('DRAW CARD') || text.includes('SWAP DECK') || text.includes('CHECK') || text.includes('CALL');
          })()
        `,
        returnByValue: true,
      });
      if (check?.result?.value === true) break;
    }
    await sleep(450);
    const shotDarkTable = await cdp.send('Page.captureScreenshot', { format: 'png' });

    // 4. Composite Overlapping Straight-On 3-Phone Studio Banner (1520x980 @ 2x DPR = 3040x1960)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1520,
      height: 980,
      deviceScaleFactor: 2,
      mobile: false,
    });

    const compositeHtml = buildCompositeHtml(shotLightHome.data, shotDarkTable.data, shotThemes.data);
    const tmpHtmlPath = join(tmpConfigDir, 'showcase.html');
    writeFileSync(tmpHtmlPath, compositeHtml, 'utf8');
    await cdp.send('Page.navigate', { url: `file:///${tmpHtmlPath.replace(/\\/g, '/')}` });
    await sleep(900);

    const finalComposite = await cdp.send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(resolve(ROOT, 'screenshots'), { recursive: true });
    const outPng = resolve(ROOT, 'screenshots/mobile-showcase.png');
    writeFileSync(outPng, Buffer.from(finalComposite.data, 'base64'));

    const oldJpg = resolve(ROOT, 'screenshots/mobile-showcase.jpg');
    if (existsSync(oldJpg)) unlinkSync(oldJpg);

    cdp.close();
    console.log(`Saved overlapping multi-theme 3-phone showcase to ${outPng}`);
  } finally {
    hostSock1?.disconnect();
    hostSock2?.disconnect();
    chromeProc?.kill();
    serverProc?.kill();
    await sleep(250);
    try {
      rmSync(tmpConfigDir, { recursive: true, force: true });
      rmSync(tmpChromeDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
