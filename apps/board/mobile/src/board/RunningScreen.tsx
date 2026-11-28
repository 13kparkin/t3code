import { BoardFrame } from "./BoardFrame";
import { RunningList } from "./RunningList";

export function RunningScreen() {
  return <BoardFrame>{(shown) => <RunningList key={shown.key} choice={shown} />}</BoardFrame>;
}
