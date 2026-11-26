/**
 * Rasterizes `public/icon.svg` and `public/icon-transparent.svg` via headless Chrome CDP
 * into crisp PNG icons for PWA, iOS Home Screen, Android, Discord Webhooks, and dashboards:
 * - `public/icon-512.png` (512x512)
 * - `public/icon-192.png` (192x192)
 * - `public/apple-touch-icon.png` (180x180, square no-alpha background for iOS)
 * - `public/icon-transparent.png` (512x512 transparent background for Homarr/Homepage/Discord)
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const chromeBin = CHROME_PATHS.find(p => existsSync(p));
if (!chromeBin) throw new Error('Chrome/Edge not found');

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
    try { this.ws.close(); } catch {}
  }
}

async function main() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'sabacc-icons-'));
  const debugPort = 49239;
  const proc = spawn(
    chromeBin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      `--user-data-dir=${tmpDir}`,
      `--remote-debugging-port=${debugPort}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    let wsUrl = null;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
        if (r.ok) {
          const pages = await r.json();
          const t = pages.find(p => p.type === 'page' && p.webSocketDebuggerUrl);
          if (t) { wsUrl = t.webSocketDebuggerUrl; break; }
        }
      } catch {}
      await sleep(120);
    }
    if (!wsUrl) throw new Error('Could not connect to Chrome CDP');

    const cdp = new CdpSession(wsUrl);
    await cdp.connect();
    await cdp.send('Page.enable');

    const svgApp = readFileSync(resolve(ROOT, 'public/icon.svg'), 'utf8');
    const svgApple = svgApp.replace('rx="108"', 'rx="0"'); // iOS applies its own squircle mask!
    const svgTransparent = readFileSync(resolve(ROOT, 'public/icon-transparent.svg'), 'utf8');

    async function renderSvgToPng(svgMarkup, size, transparentBg, outPath) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: size,
        height: size,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await cdp.send('Emulation.setDefaultBackgroundColorOverride', {
        color: transparentBg ? { r: 0, g: 0, b: 0, a: 0 } : { r: 5, g: 7, b: 11, a: 1 },
      });
      const html = `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px;overflow:hidden;background:transparent}svg{width:100%;height:100%;display:block}</style></head><body>${svgMarkup}</body></html>`;
      const htmlPath = join(tmpDir, `icon-${size}.html`);
      writeFileSync(htmlPath, html, 'utf8');
      await cdp.send('Page.navigate', { url: `file:///${htmlPath.replace(/\\/g, '/')}` });
      await sleep(250);
      const shot = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        omitBackground: transparentBg,
      });
      writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    }

    await renderSvgToPng(svgApp, 512, true, resolve(ROOT, 'public/icon-512.png'));
    await renderSvgToPng(svgApple, 512, false, resolve(ROOT, 'public/icon-maskable.png'));
    await renderSvgToPng(svgApp, 192, true, resolve(ROOT, 'public/icon-192.png'));
    await renderSvgToPng(svgApple, 180, false, resolve(ROOT, 'public/apple-touch-icon.png'));
    await renderSvgToPng(svgTransparent, 512, true, resolve(ROOT, 'public/icon-transparent.png'));

    cdp.close();
    console.log('Generated icon-512.png, icon-192.png, apple-touch-icon.png, and icon-transparent.png');
  } finally {
    proc.kill();
    await sleep(200);
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
