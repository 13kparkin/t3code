import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { styles } from "./styles";

export function NotPairedBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.banner, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.bannerText}>Not paired</Text>
    </View>
  );
}
