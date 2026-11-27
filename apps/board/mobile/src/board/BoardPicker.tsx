import { RegistryContext } from "@effect/atom-react";
import { useTheme } from "@react-navigation/native";
import { useContext } from "react";
import { Pressable, ScrollView, Text } from "react-native";

import { styles } from "../styles";
import { type BoardChoice, pickedBoardAtom } from "./files";

export function BoardPicker({
  boards,
  shown,
}: {
  boards: ReadonlyArray<BoardChoice>;
  shown: BoardChoice;
}) {
  const { colors } = useTheme();
  const registry = useContext(RegistryContext);
  return (
    <ScrollView horizontal contentContainerStyle={styles.chips} style={styles.chipRow}>
      {boards.map((choice) => {
        const picked = choice.key === shown.key;
        return (
          <Pressable
            key={choice.key}
            accessibilityRole="button"
            accessibilityState={{ selected: picked }}
            onPress={() => registry.set(pickedBoardAtom, choice.key)}
            style={[styles.chip, { borderColor: picked ? colors.primary : colors.border }]}
          >
            <Text style={{ color: picked ? colors.primary : colors.text }}>
              {choice.listed.ok ? choice.listed.board.name : choice.listed.folder}
            </Text>
            <Text style={[styles.small, styles.muted, { color: colors.text }]}>
              {choice.project.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
