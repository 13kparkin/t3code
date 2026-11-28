import type { ComponentType } from "react";

import { RunningScreen } from "../board/RunningScreen";
import { ChatScreen } from "../chat/ChatScreen";
import { ForYouScreen } from "../foryou/ForYouScreen";
import { type Icon, IconChat, IconForYou, IconRunning } from "../icons";

export interface PhoneTab {
  readonly name: "For you" | "Running" | "Chat";
  readonly icon: Icon;
  readonly component: ComponentType;
}

export const PHONE_TABS: ReadonlyArray<PhoneTab> = [
  { name: "For you", icon: IconForYou, component: ForYouScreen },
  { name: "Running", icon: IconRunning, component: RunningScreen },
  { name: "Chat", icon: IconChat, component: ChatScreen },
];
