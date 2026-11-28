import { RegistryContext, useAtom, useAtomMount, useAtomValue } from "@effect/atom-react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useContext, useState } from "react";
import { Pressable, View } from "react-native";

import { AppText } from "../AppText";
import { AppTextInput } from "../AppTextInput";
import { styles } from "../styles";
import { deepLinkPairingAtom, pair, pairingInputAtom, pairingStateAtom } from "./engine";
import { pairingHost } from "./pairing";

export function PairScreen() {
  const registry = useContext(RegistryContext);
  const { busy, error } = useAtomValue(pairingStateAtom);
  const [scanning, setScanning] = useState(false);
  const [pasted, setPasted] = useAtom(pairingInputAtom);
  const [permission, requestPermission] = useCameraPermissions();
  useAtomMount(deepLinkPairingAtom);
  const host = pairingHost(pasted);

  const scan = async () => {
    setScanning(permission?.granted || (await requestPermission()).granted);
  };

  if (scanning) {
    return (
      <View style={styles.fill}>
        <CameraView
          style={styles.fill}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            setScanning(false);
            void pair(registry, data);
          }}
        />
        <Pressable style={styles.button} onPress={() => setScanning(false)}>
          <AppText style={styles.buttonText}>Cancel</AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.body, styles.readable]}>
      <AppText style={styles.title}>Pair with your PC</AppText>
      <AppText>On the PC, open Agent Board, then Settings, Phone, and press Pair a phone.</AppText>
      <Pressable style={styles.button} disabled={busy} onPress={() => void scan()}>
        <AppText style={styles.buttonText}>Scan QR code</AppText>
      </Pressable>
      {permission?.status === "denied" && (
        <AppText style={styles.error}>Allow the camera to scan the pairing code.</AppText>
      )}
      <AppText style={[styles.muted, styles.pairOr]}>Or paste the pairing link</AppText>
      <AppTextInput
        placeholder="Pairing link"
        autoCapitalize="none"
        autoCorrect={false}
        value={pasted}
        onChangeText={setPasted}
      />
      <Pressable
        style={styles.quietButton}
        disabled={busy || pasted.trim() === ""}
        onPress={() => void pair(registry, pasted)}
      >
        <AppText style={styles.bold}>
          {busy ? "Pairing" : host === null ? "Pair" : `Pair with ${host}`}
        </AppText>
      </Pressable>
      {error !== null && (
        <AppText accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      )}
    </View>
  );
}
