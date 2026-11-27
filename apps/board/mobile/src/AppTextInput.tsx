import { COLORS } from "@agent-board/app/theme/tokens";
import { TextInput, type TextInputProps } from "react-native";

import { styles } from "./styles";

export function AppTextInput({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={COLORS.faint}
      selectionColor={COLORS.focus}
      cursorColor={COLORS.focus}
      {...props}
      style={[styles.input, style]}
    />
  );
}
