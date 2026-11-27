import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { ReviewTemplate } from "../domain/reviewTemplate";

const FileBox = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  width: Schema.optionalKey(Schema.Finite),
  height: Schema.optionalKey(Schema.Finite),
  open: Schema.optionalKey(Schema.Boolean),
  /** Raised past every other box of the board when the user presses it. */
  z: Schema.optionalKey(Schema.Finite),
});
export type FileBox = typeof FileBox.Type;

const LocalState = Schema.Struct({
  lastOpenedBoard: Schema.NullOr(
    Schema.Struct({ projectId: Schema.String, folder: Schema.String }),
  ),
  /** The ticket keys in the order the user dragged them to, by board id, then lane. */
  frameOrder: Schema.Record(
    Schema.String,
    Schema.Record(Schema.String, Schema.Array(Schema.String)),
  ).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
  /** The canvas filters the user flipped from their default, `lane:<board id>:<filter id>`, and the ticket sections they collapsed, `sec:<id>`. */
  folded: Schema.Array(Schema.String).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
  threadShown: Schema.Record(Schema.String, Schema.Boolean).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({})),
  ),
  /** Whether the app installs engine and provider updates itself. Both start off. */
  autoUpdate: Schema.Struct({ engine: Schema.Boolean, providers: Schema.Boolean }).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({ engine: false, providers: false })),
  ),
  /** Whether the app offers its own test releases. Starts off. */
  appPrereleases: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
  /** The release each item announced last, so a later launch does not announce it again. */
  announcedUpdates: Schema.Record(Schema.String, Schema.String).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({})),
  ),
  /** The editor a file was last opened in, which the editor menu lists first. */
  lastEditor: Schema.NullOr(Schema.String).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(null)),
  ),
  /** The latest automatic update of each item, by key. */
  automaticUpdates: Schema.Record(
    Schema.String,
    Schema.Struct({ version: Schema.String, at: Schema.String }),
  ).pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
  /** The templates the user built on the Reviews page. The system template is not stored. */
  reviewTemplates: Schema.Array(ReviewTemplate).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([])),
  ),
  /** Whether the user accepted the call recording notice. The main process reads it too, and records nothing until it is true. */
  recordingConsent: Schema.Boolean.pipe(Schema.withDecodingDefaultKey(Effect.succeed(false))),
  /**
   * The Artifacts area and the files sections opened from it, by board id then box key: `artifacts`,
   * `dir:<path>`, or `call:<id>`. `x` and `y` are canvas px from the area's place in the top row.
   */
  fileBoxes: Schema.Record(Schema.String, Schema.Record(Schema.String, FileBox)).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({})),
  ),
});
export type LocalState = typeof LocalState.Type;

export const EMPTY_LOCAL_STATE: LocalState = {
  lastOpenedBoard: null,
  frameOrder: {},
  folded: [],
  threadShown: {},
  autoUpdate: { engine: false, providers: false },
  appPrereleases: false,
  announcedUpdates: {},
  automaticUpdates: {},
  lastEditor: null,
  reviewTemplates: [],
  recordingConsent: false,
  fileBoxes: {},
};

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(LocalState));

/** The app's user data folder, which only the main process can reach. */
export interface LocalStateStorage {
  readonly read: () => Promise<string>;
  readonly write: (text: string) => Promise<void>;
}

/** State that belongs to this machine and stays out of the project: what the user last had open. */
export function createLocalState(storage: LocalStateStorage) {
  let queue: Promise<unknown> = Promise.resolve();
  const read = async (): Promise<LocalState> =>
    Option.getOrElse(decode(await storage.read()), () => EMPTY_LOCAL_STATE);
  return {
    read,
    /** Reads, changes, and writes one update at a time, so two quick updates both land. */
    update: (change: (state: LocalState) => LocalState): Promise<LocalState> => {
      const next = queue.then(async () => {
        const state = change(await read());
        await storage.write(JSON.stringify(state));
        return state;
      });
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
