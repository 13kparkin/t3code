export type EngineState =
  | { readonly phase: "connecting" }
  | { readonly phase: "starting" }
  | { readonly phase: "installing" }
  | { readonly phase: "updating" }
  | { readonly phase: "install-needed" }
  | { readonly phase: "update-needed"; readonly found: string }
  | {
      readonly phase: "ready";
      readonly origin: string;
      /** `url` for an engine named by `AGENT_BOARD_ENGINE_URL`, which the app never updates. */
      readonly source: "service" | "url";
    }
  | { readonly phase: "offline"; readonly reason: string };

export type EngineTokenResult =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly error: "auth_failed" | "unavailable"; readonly detail: string };

/** What the preload script exposes on `window.board`. */
export interface BoardBridge {
  readonly reportFirstPaint: (epochMs: number) => void;
  readonly reportEngineConnected: (epochMs: number) => void;
  /** Writes one engine connection event to the log file in the app's user data folder. */
  readonly logConnection: (line: string) => void;
  readonly engineState: () => Promise<EngineState>;
  readonly onEngineState: (listener: (state: EngineState) => void) => () => void;
  readonly engineToken: () => Promise<EngineTokenResult>;
  /** Answers the install or update question the footer is asking. */
  readonly answerPrompt: (accepted: boolean) => void;
  /** Shows the folder dialog in the user's WSL home. Null when the user cancels. */
  readonly pickFolder: () => Promise<FolderResult | null>;
  /** Checks a typed folder and returns its path inside WSL. */
  readonly resolveFolder: (text: string) => Promise<FolderResult>;
  /** The text of the file in the app's user data folder, empty when there is none. */
  readonly readLocalState: () => Promise<string>;
  readonly writeLocalState: (text: string) => Promise<void>;
  /** Clones or refreshes the pstack-t3 checkout the board's Claude instances load, and returns its folder. */
  readonly ensurePstack: () => Promise<PstackResult>;
  /** The raw `.agents/skills` SKILL.md listing for a project and the WSL home. */
  readonly listAgentSkills: (projectRoot: string) => Promise<string>;
  readonly browser: BrowserHost;
  readonly appUpdate: AppUpdateHost;
}

/** The app's own release, which only the packaged app checks for and installs. */
export type AppUpdateState = { readonly current: string } & (
  | { readonly status: "disabled" | "unchecked" | "current" }
  | { readonly status: "available" | "downloaded"; readonly version: string }
  | { readonly status: "downloading"; readonly version: string; readonly percent: number }
  /** Null when the check failed, otherwise the release whose download failed, so it can be retried. */
  | { readonly status: "error"; readonly message: string; readonly version: string | null }
);

export interface AppUpdateHost {
  readonly state: () => Promise<AppUpdateState>;
  readonly onState: (listener: (state: AppUpdateState) => void) => () => void;
  readonly download: () => void;
  /** `activeRuns` is the renderer's count. The main process refuses unless it is 0 and the update is downloaded. */
  readonly restart: (activeRuns: number) => void;
  readonly setPrereleases: (enabled: boolean) => void;
}

export type PstackResult =
  | { readonly ok: true; readonly dir: string }
  | { readonly ok: false; readonly reason: string };

export type FolderResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: string };

export interface BrowserTabState {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly loading: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

/** Where the active tab's page is drawn, in window coordinates. */
export interface BrowserBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The user's tabs, each a native page that the main process lays over the window. */
export interface BrowserHost {
  /** An empty url opens a blank tab. */
  readonly open: (id: string, url: string) => void;
  readonly close: (id: string) => void;
  /** Null hides every page. */
  readonly activate: (id: string | null) => void;
  readonly navigate: (id: string, url: string) => void;
  readonly history: (id: string, delta: -1 | 1) => void;
  readonly reload: (id: string) => void;
  /** Null hides the active page, which a hidden or collapsed panel needs. */
  readonly setBounds: (bounds: BrowserBounds | null) => void;
  readonly onTabState: (listener: (state: BrowserTabState) => void) => () => void;
}
