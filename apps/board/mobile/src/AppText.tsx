import { Text, type TextProps } from "react-native";

import { styles } from "./styles";

/** React Native has no default font, so every text goes through this and AppTextInput, as in apps/mobile. */
export function AppText({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.text, style]} />;
}
