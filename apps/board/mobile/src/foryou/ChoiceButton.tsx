import { useTheme } from "@react-navigation/native";
import { Pressable, Text } from "react-native";

import { styles } from "../styles";

export function ChoiceButton({
  primary = false,
  disabled,
  onPress,
  children,
}: {
  primary?: boolean;
  disabled: boolean;
  onPress: () => void;
  children: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        primary ? styles.button : [styles.chip, { borderColor: colors.border }],
        disabled && styles.muted,
      ]}
    >
      <Text style={primary ? styles.buttonText : { color: colors.text }}>{children}</Text>
    </Pressable>
  );
}
