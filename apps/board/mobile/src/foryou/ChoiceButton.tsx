import { Pressable } from "react-native";

import { AppText } from "../AppText";
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[primary ? styles.button : styles.quietButton, disabled && styles.disabled]}
    >
      <AppText style={primary ? styles.buttonText : styles.quietButtonText}>{children}</AppText>
    </Pressable>
  );
}
