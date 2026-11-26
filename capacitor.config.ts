import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.thenotoriousjeremy.sabacc',
  appName: 'Corellian Spike Sabacc',
  webDir: 'out',
  backgroundColor: '#05070b',
  android: {
    // Allow optional LAN multiplayer connections over local HTTP while solo modes run offline on-device.
    allowMixedContent: true,
    backgroundColor: '#05070b',
  },
  ios: {
    backgroundColor: '#05070b',
    contentInset: 'never',
  },
};

export default config;
