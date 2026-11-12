import type { ExpoConfig } from 'expo/config';

// Mesa's phone app (ADR-0027). Identifiers are Apple's and fixed once a build exists.
const BUNDLE_ID = 'com.guillezorrilla.mesa';
const TEAM_ID = 'EMTB6K854Q';
/** The Expo project on expo.dev, made once by `eas init` under the Expo account `guillecoto`. */
const EAS_PROJECT_ID = '91db22b0-7dc0-4d75-80b1-f253572225a9';

const config: ExpoConfig = {
  name: 'Mesa',
  slug: 'mesa',
  owner: 'guillecoto',
  scheme: 'mesa',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  runtimeVersion: { policy: 'fingerprint' },
  ...(EAS_PROJECT_ID
    ? {
        updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
        extra: { eas: { projectId: EAS_PROJECT_ID } },
      }
    : {}),
  experiments: { reactCompiler: true },
  ios: {
    bundleIdentifier: BUNDLE_ID,
    appleTeamId: TEAM_ID,
    supportsTablet: false,
    infoPlist: {
      // Standard encryption protecting the person's own data only (owner, 2026-11-11), so App
      // Store Connect asks no export-compliance question per build.
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      // Production always: TestFlight is the only device build, and Expo's default (development)
      // sends its pushes to APNs' sandbox, where they are lost (orca's app.config.js). One value
      // for every build also keeps the native fingerprint CI computes equal to the build's.
      'aps-environment': 'production',
      // Shared with the Notification Service Extension (#1016), which opens pushes with the pairing key.
      'keychain-access-groups': [`$(AppIdentifierPrefix)${BUNDLE_ID}`],
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-font',
      {
        fonts: [
          ...['400Regular', '500Medium', '600SemiBold'].map(
            (face) =>
              `./node_modules/@expo-google-fonts/ibm-plex-sans/${face}/IBMPlexSans_${face}.ttf`,
          ),
          ...['400Regular', '500Medium'].map(
            (face) =>
              `./node_modules/@expo-google-fonts/ibm-plex-mono/${face}/IBMPlexMono_${face}.ttf`,
          ),
        ],
      },
    ],
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#18191c' },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Mesa uses the camera to scan the pairing code your Mac shows.',
        recordAudioAndroid: false,
      },
    ],
  ],
};

export default config;
