import { useWide } from "../shell/useWide";
import { BoardCanvas } from "./BoardCanvas";
import { BoardFrame } from "./BoardFrame";
import { RunningList } from "./RunningList";

export function RunningScreen() {
  const wide = useWide();
  return (
    <BoardFrame>
      {(shown) =>
        wide ? (
          <BoardCanvas key={shown.key} choice={shown} />
        ) : (
          <RunningList key={shown.key} choice={shown} />
        )
      }
    </BoardFrame>
  );
}
