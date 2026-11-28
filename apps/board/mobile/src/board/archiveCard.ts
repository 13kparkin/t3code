import {
  BOARD_FILE,
  BOARDS_DIR,
  parseBoard,
  serializeBoard,
  withCardState,
} from "@agent-board/app/domain/board";
import type { AtomRegistry } from "effect/reactivity";
import * as Result from "effect/Result";
import { Alert } from "react-native";

import { engineFiles, writeEngineFile } from "../connection/engine";
import { type BoardChoice, boardListAtom } from "./files";

/** The desktop card menu's Archive, on a long press: it saves the card's state in `board.json` as the desktop does. */
export function offerArchive(
  registry: AtomRegistry.AtomRegistry,
  choice: BoardChoice,
  key: string,
  label: string,
) {
  const archive = async () => {
    const { environmentId, workspaceRoot: cwd } = choice.project;
    const relativePath = `${BOARDS_DIR}/${choice.listed.folder}/${BOARD_FILE}`;
    try {
      const text = await engineFiles(registry, environmentId).read(cwd, relativePath);
      const parsed = parseBoard(text ?? "");
      if (Result.isFailure(parsed)) throw new Error(parsed.failure.message);
      const contents = serializeBoard(withCardState(parsed.success, key, "archived"));
      await writeEngineFile(registry, environmentId, { cwd, relativePath, contents });
      registry.refresh(boardListAtom);
    } catch (failure) {
      Alert.alert(
        "Could not archive",
        failure instanceof Error ? failure.message : String(failure),
      );
    }
  };
  Alert.alert(label, undefined, [
    { text: "Cancel", style: "cancel" },
    { text: "Archive", style: "destructive", onPress: () => void archive() },
  ]);
}
