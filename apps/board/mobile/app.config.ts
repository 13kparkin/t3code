import type { ExpoConfig } from "expo/config";

// Expo would install `typescript` on every start; effect-tsgo typechecks this app.
process.env.EXPO_NO_TYPESCRIPT_SETUP = "1";

const development = process.env.APP_VARIANT === "development";

export default {
  name: development ? "Agent Board Dev" : "Agent Board",
  slug: "agent-board-phone",
  scheme: development ? "agentboard-phone-dev" : "agentboard-phone",
  orientation: "default",
  userInterfaceStyle: "automatic",
  android: {
    package: development ? "dev.agentboard.phone.dev" : "dev.agentboard.phone",
    // The paired engine's session credential must not leave the phone in a backup.
    allowBackup: false,
  },
  plugins: [
    ["expo-build-properties", { android: { minSdkVersion: 24 } }],
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
} satisfies ExpoConfig;
