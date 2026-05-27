import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.skdev.chillbill',
  appName: 'ChillBill',
  webDir: 'dist',
  server: {
    // For local dev against the Vite server, uncomment and set your machine's LAN IP:
    // url: 'http://192.168.x.x:5173',
    // cleartext: true,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      // Web client ID from Google Cloud Console (NOT the Android client ID).
      // Override at build time via the GoogleAuth.initialize() call in the app.
      serverClientId: '',
      forceCodeForRefreshToken: false,
    },
  },
};

export default config;
