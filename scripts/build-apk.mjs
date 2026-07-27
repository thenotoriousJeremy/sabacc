// Builds the Android client APK from the static export.
//
// The android/ project is generated rather than committed, so there are no
// hundreds of Gradle files in the repo. Requires a JDK and the Android SDK.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const isWindows = process.platform === 'win32';
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', shell: isWindows, ...opts });

// NEXT_PUBLIC_REQUIRE_HOST makes the client ask for a host address, since the
// APK has no server of its own to talk to.
console.log('> building static client bundle');
run('npx', ['--yes', 'next', 'build'], {
  env: { ...process.env, STATIC_EXPORT: 'true', NEXT_PUBLIC_REQUIRE_HOST: 'true' },
});

if (!existsSync('out/index.html')) {
  throw new Error('static export produced no out/index.html');
}

if (!existsSync('android')) {
  console.log('> generating android project');
  run('npx', ['--yes', 'cap', 'add', 'android']);
}

console.log('> syncing web assets into android project');
run('npx', ['--yes', 'cap', 'sync', 'android']);

// Players host on their LAN over plain HTTP. Android blocks cleartext traffic by
// default from API 28, which would make every join attempt fail silently.
const manifestPath = join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
const manifest = readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android:usesCleartextTraffic')) {
  console.log('> enabling cleartext traffic for LAN hosts');
  writeFileSync(
    manifestPath,
    manifest.replace('<application', '<application android:usesCleartextTraffic="true"')
  );
}

// ponytail: debug-signed so the APK installs without a keystore. Swap to
// assembleRelease plus signing config once there is a keystore to sign with.
console.log('> assembling APK');
const gradlew = isWindows ? 'gradlew.bat' : './gradlew';
run(gradlew, ['assembleDebug'], { cwd: 'android' });

const apk = join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(apk)) throw new Error(`expected APK at ${apk}`);
console.log(`\n> built ${apk}`);
