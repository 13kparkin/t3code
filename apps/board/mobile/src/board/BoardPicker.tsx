import { RegistryContext } from "@effect/atom-react";
import { useContext } from "react";
import { Pressable, ScrollView } from "react-native";

import { AppText } from "../AppText";
import { styles } from "../styles";
import { type BoardChoice, pickedBoardAtom } from "./files";

export function BoardPicker({
  boards,
  shown,
}: {
  boards: ReadonlyArray<BoardChoice>;
  shown: BoardChoice;
}) {
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
            style={[styles.chip, picked && styles.chipPicked]}
          >
            <AppText style={styles.bold}>
              {choice.listed.ok ? choice.listed.board.name : choice.listed.folder}
            </AppText>
            <AppText style={[styles.small, styles.faint]}>{choice.project.title}</AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
