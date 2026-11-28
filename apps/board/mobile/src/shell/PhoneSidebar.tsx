import { COLORS } from "@agent-board/app/theme/tokens";
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useContext } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { AppText } from "../AppText";
import { boardListAtom, pickedBoardAtom, shownBoardAtom } from "../board/files";
import { forYouOpenCountAtom } from "../foryou/forYouAtoms";
import { type Icon, IconBoard, IconFold, IconProjects, IconUnfold } from "../icons";
import { styles } from "../styles";
import { sidebarModeAtom } from "./sidebarMode";
import { PHONE_TABS } from "./tabs";

/** The desktop's left sidebar on a wide screen: the tabs, the boards by project, and the fold to its rail. */
export function PhoneSidebar({ state, navigation }: BottomTabBarProps) {
  const registry = useContext(RegistryContext);
  const mode = useAtomValue(sidebarModeAtom);
  const openCount = useAtomValue(forYouOpenCountAtom);
  const list = useAtomValue(boardListAtom);
  const shown = useAtomValue(shownBoardAtom);
  const current = state.routes[state.index]?.name;
  const go = (name: string) => navigation.navigate(name);
  const setMode = (next: typeof mode) => registry.set(sidebarModeAtom, next);
  const icon = (TabIcon: Icon, active: boolean) => (
    <TabIcon color={COLORS.fg} size={16} strokeWidth={1.75} style={!active && styles.railIdle} />
  );

  if (mode === "rail") {
    return (
      <View style={styles.rail} accessibilityRole="menu" accessibilityLabel="Sidebar">
        {PHONE_TABS.map(({ name, icon: TabIcon }) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityLabel={name === "For you" ? `For you, ${openCount} open` : name}
            accessibilityState={{ selected: current === name }}
            onPress={() => go(name)}
            style={styles.railButton}
          >
            {icon(TabIcon, current === name)}
            {name === "For you" && openCount > 0 && <View style={styles.railDot} />}
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Projects"
          onPress={() => setMode("expanded")}
          style={styles.railButton}
        >
          {icon(IconProjects, false)}
        </Pressable>
        <View style={styles.fill} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show the full sidebar"
          onPress={() => setMode("expanded")}
          style={styles.railButton}
        >
          {icon(IconUnfold, false)}
        </Pressable>
      </View>
    );
  }

  const boards = list === null || list instanceof Error ? [] : list.boards;
  const projects = [...new Set(boards.map((choice) => choice.project.title))];
  return (
    <View style={styles.sidebar} accessibilityLabel="Sidebar">
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <AppText style={styles.brandMarkText}>ab</AppText>
        </View>
        <AppText style={styles.bold}>Agent Board</AppText>
      </View>
      {PHONE_TABS.map(({ name, icon: TabIcon }) => (
        <Pressable
          key={name}
          accessibilityRole="button"
          accessibilityState={{ selected: current === name }}
          onPress={() => go(name)}
          style={[styles.sidebarRow, current === name && styles.sidebarRowSelected]}
        >
          {icon(TabIcon, true)}
          <AppText style={styles.fill}>{name}</AppText>
          {name === "For you" && (
            <AppText style={openCount > 0 ? styles.countUrgent : styles.countQuiet}>
              {openCount}
            </AppText>
          )}
        </Pressable>
      ))}
      <AppText style={styles.sidebarSection}>Projects</AppText>
      <ScrollView style={styles.fill}>
        {projects.map((title) => (
          <View key={title}>
            <AppText style={[styles.sidebarRow, styles.bold]}>{title}</AppText>
            {boards
              .filter((choice) => choice.project.title === title)
              .map((choice) => (
                <Pressable
                  key={choice.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: shown?.key === choice.key }}
                  onPress={() => {
                    registry.set(pickedBoardAtom, choice.key);
                    go("Running");
                  }}
                  style={[
                    styles.sidebarRow,
                    styles.sidebarBoard,
                    shown?.key === choice.key && styles.sidebarRowSelected,
                  ]}
                >
                  {icon(IconBoard, true)}
                  <AppText style={styles.fill} numberOfLines={1}>
                    {choice.listed.ok ? choice.listed.board.name : choice.listed.folder}
                  </AppText>
                </Pressable>
              ))}
          </View>
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fold the sidebar to icons"
        onPress={() => setMode("rail")}
        style={styles.sidebarRow}
      >
        {icon(IconFold, true)}
        <AppText style={styles.muted}>Fold</AppText>
      </Pressable>
    </View>
  );
}
