import type { ExpoConfig } from "expo/config";
import { withAppBuildGradle } from "expo/config-plugins";

// Expo would install `typescript` on every start; effect-tsgo typechecks this app.
process.env.EXPO_NO_TYPESCRIPT_SETUP = "1";

const development = process.env.APP_VARIANT === "development";

// The keystore path, alias and passwords are Gradle properties in ~/.gradle/gradle.properties, never in the repo.
// Without them the release build has no key, never the debug one, and release-phone.mjs stops first.
const RELEASE_SIGNING_CONFIG = `
        release {
            if (project.hasProperty('AGENT_BOARD_PHONE_KEYSTORE')) {
                storeFile file(AGENT_BOARD_PHONE_KEYSTORE)
                storePassword AGENT_BOARD_PHONE_STORE_PASSWORD
                keyAlias AGENT_BOARD_PHONE_KEY_ALIAS
                keyPassword AGENT_BOARD_PHONE_KEY_PASSWORD
            }
        }`;

const withReleaseSigning = (config: ExpoConfig) =>
  withAppBuildGradle(config, (nextConfig) => {
    const signed = nextConfig.modResults.contents
      .replace(
        /(buildTypes \{[\s\S]*?release \{[^}]*?)signingConfig signingConfigs\.debug/,
        "$1signingConfig signingConfigs.release",
      )
      .replace(/signingConfigs \{/, `$&${RELEASE_SIGNING_CONFIG}`);
    if (!signed.includes("signingConfig signingConfigs.release")) {
      throw new Error("withReleaseSigning: Expo's app/build.gradle template changed shape.");
    }
    nextConfig.modResults.contents = signed;
    return nextConfig;
  });

export default withReleaseSigning({
  name: development ? "Agent Board Dev" : "Agent Board",
  slug: "agent-board-phone",
  version: process.env.AGENT_BOARD_PHONE_VERSION ?? "0.0.0",
  scheme: development ? "agentboard-phone-dev" : "agentboard-phone",
  orientation: "default",
  userInterfaceStyle: "automatic",
  android: {
    package: development ? "dev.agentboard.phone.dev" : "dev.agentboard.phone",
    // The paired engine's session credential must not leave the phone in a backup.
    allowBackup: false,
    versionCode: Number(process.env.AGENT_BOARD_PHONE_VERSION_CODE ?? 1),
    // Expo's template, expo-network and expo-secure-store ask for these; the app draws no overlays, keeps no files,
    // never vibrates, reads no Wi-Fi details and never sets SecureStore's requireAuthentication.
    blockedPermissions: [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.VIBRATE",
      "android.permission.ACCESS_WIFI_STATE",
      "android.permission.USE_BIOMETRIC",
      "android.permission.USE_FINGERPRINT",
    ],
  },
  plugins: [
    // A LAN engine is plain http, which Android blocks in release builds by default.
    ["expo-build-properties", { android: { minSdkVersion: 24, usesCleartextTraffic: true } }],
    "expo-secure-store",
    [
      "expo-camera",
      {
        cameraPermission: "Allow Agent Board to use the camera to scan pairing QR codes.",
        microphonePermission: false,
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
  ],
} satisfies ExpoConfig);
