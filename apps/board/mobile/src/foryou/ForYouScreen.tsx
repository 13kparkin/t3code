import { BoardFrame } from "../board/BoardFrame";
import { ForYouCards } from "./ForYouCards";

export function ForYouScreen() {
  return <BoardFrame>{(shown) => <ForYouCards key={shown.key} choice={shown} />}</BoardFrame>;
}
