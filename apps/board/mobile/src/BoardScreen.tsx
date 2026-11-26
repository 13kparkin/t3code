import { useAtomValue } from "@effect/atom-react";
import { useTheme } from "@react-navigation/native";
import { ScrollView, Text, View } from "react-native";

import { boardProjectsAtom } from "./connection/engine";
import { styles } from "./styles";

export function BoardScreen() {
  const { colors } = useTheme();
  const projects = useAtomValue(boardProjectsAtom);
  if (projects === null) {
    return <Text style={[styles.body, { color: colors.text }]}>Looking for boards</Text>;
  }
  if (projects.length === 0) {
    return (
      <Text style={[styles.body, { color: colors.text }]}>No project on this PC has a board.</Text>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.body}>
      {projects.map((project) => (
        <View key={project.id}>
          <Text style={[styles.title, { color: colors.text }]}>{project.title}</Text>
          <Text style={[styles.muted, { color: colors.text }]}>{project.workspaceRoot}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
