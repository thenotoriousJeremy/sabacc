import type { CapacitorConfig } from '@capacitor/cli';

// The Android app is a client only. It ships the static UI and connects to a
// host machine running the server, so the player enters a host address on
// first launch.
const config: CapacitorConfig = {
  appId: 'com.thenotoriousjeremy.sabacc',
  appName: 'Corellian Spike Sabacc',
  webDir: 'out',
  android: {
    // Hosts on a LAN are reached over plain HTTP, which Android blocks by
    // default from API 28 onward.
    allowMixedContent: true,
  },
};

export default config;
