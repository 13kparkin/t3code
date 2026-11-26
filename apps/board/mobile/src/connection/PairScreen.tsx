import { RegistryContext, useAtom, useAtomMount, useAtomValue } from "@effect/atom-react";
import { useTheme } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useContext, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { styles } from "../styles";
import { deepLinkPairingAtom, pair, pairingInputAtom, pairingStateAtom } from "./engine";
import { pairingHost } from "./pairing";

export function PairScreen() {
  const { colors } = useTheme();
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
          <Text style={styles.buttonText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <Text style={[styles.title, { color: colors.text }]}>Pair with your PC</Text>
      <Text style={{ color: colors.text }}>
        On the PC, open T3 Code, then Settings, Connections, and add a client. Scan its QR code or
        paste its pairing link here.
      </Text>
      <Pressable style={styles.button} disabled={busy} onPress={() => void scan()}>
        <Text style={styles.buttonText}>Scan QR code</Text>
      </Pressable>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        placeholder="Pairing link"
        placeholderTextColor={colors.border}
        autoCapitalize="none"
        autoCorrect={false}
        value={pasted}
        onChangeText={setPasted}
      />
      <Pressable
        style={styles.button}
        disabled={busy || pasted.trim() === ""}
        onPress={() => void pair(registry, pasted)}
      >
        <Text style={styles.buttonText}>
          {busy ? "Pairing" : host === null ? "Pair" : `Pair with ${host}`}
        </Text>
      </Pressable>
      {permission?.status === "denied" && (
        <Text style={styles.error}>Allow the camera to scan the pairing code.</Text>
      )}
      {error !== null && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}
