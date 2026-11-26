import { useRoute, useTheme } from "@react-navigation/native";
import { Text } from "react-native";

import { styles } from "./styles";

export function PlaceholderScreen() {
  const { colors } = useTheme();
  const { name } = useRoute();
  return <Text style={[styles.body, { color: colors.text }]}>{name} is coming soon.</Text>;
}
