// Builds the standalone host binary: bundle the server, then embed it in a copy
// of the Node runtime with Node's Single Executable Application support.
//
// SEA cannot cross-compile, so this must run once per target OS. CI does that
// with a matrix; locally it produces a binary for the machine you run it on.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync, cpSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const BUNDLE = join(DIST, 'host.cjs');
const BLOB = join(DIST, 'sea-prep.blob');
const SEA_CONFIG = join(DIST, 'sea-config.json');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const exeName = isWindows ? 'sabacc-host.exe' : 'sabacc-host';
const EXE = join(DIST, exeName);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

console.log('> bundling server');
await build({
  entryPoints: ['server.ts'],
  outfile: BUNDLE,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  // `next` is only reachable on the dev code path, which the binary never takes.
  // The ws extras are optional native speedups that ws already require()s safely.
  external: ['next', 'bufferutil', 'utf-8-validate'],
  define: {
    'process.env.SABACC_PACKAGED': '"true"',
    'process.env.NODE_ENV': '"production"',
  },
  legalComments: 'none',
  logLevel: 'warning',
});

console.log('> building static web bundle');
execFileSync('npx', ['--yes', 'next', 'build'], {
  stdio: 'inherit',
  shell: isWindows,
  env: { ...process.env, STATIC_EXPORT: 'true' },
});

if (!existsSync('out/index.html')) {
  throw new Error('static export produced no out/index.html');
}
console.log('> staging web assets');
cpSync('out', join(DIST, 'web'), { recursive: true });

console.log('> generating SEA blob');
writeFileSync(
  SEA_CONFIG,
  JSON.stringify({ main: BUNDLE, output: BLOB, disableExperimentalSEAWarning: true }, null, 2)
);
execFileSync(process.execPath, ['--experimental-sea-config', SEA_CONFIG], { stdio: 'inherit' });

console.log('> copying node runtime');
copyFileSync(process.execPath, EXE);
if (!isWindows) chmodSync(EXE, 0o755);

// A signed runtime rejects an injected blob, so drop the signature first and
// re-sign afterwards on macOS.
if (isMac) {
  try {
    execFileSync('codesign', ['--remove-signature', EXE], { stdio: 'inherit' });
  } catch {
    console.warn('! codesign --remove-signature failed, continuing');
  }
}

console.log('> injecting blob');
const postjectArgs = [
  'postject',
  EXE,
  'NODE_SEA_BLOB',
  BLOB,
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];
if (isMac) postjectArgs.push('--macho-segment-name', 'NODE_SEA');
execFileSync('npx', ['--yes', ...postjectArgs], { stdio: 'inherit', shell: isWindows });

if (isMac) {
  try {
    execFileSync('codesign', ['--sign', '-', EXE], { stdio: 'inherit' });
  } catch {
    console.warn('! ad-hoc codesign failed; macOS may refuse to run the binary');
  }
}

rmSync(BLOB, { force: true });
rmSync(SEA_CONFIG, { force: true });
rmSync(BUNDLE, { force: true });

console.log(`\n> built ${EXE}`);
console.log('> ship it alongside the dist/web directory');
