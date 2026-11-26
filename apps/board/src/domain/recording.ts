import * as Schema from "effect/Schema";

import { CallApp } from "./board";

/** Every call id is checked against this before the main process builds a path from it. */
export const CallId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9-]{1,64}$/));

export const RecordRequest = Schema.Struct({
  callId: CallId,
  boardId: Schema.String.check(Schema.isMaxLength(200)),
  title: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)),
  app: CallApp,
});
export type RecordRequest = typeof RecordRequest.Type;

/** One file of a take on this PC, found by its call and start. Only the names the recorder writes. */
export const RecordingFile = Schema.Struct({
  callId: CallId,
  startedAt: Schema.String.check(Schema.isMaxLength(64)),
  file: Schema.Literals(["me.wav", "them.wav", "recording.json"]),
});
export type RecordingFile = typeof RecordingFile.Type;

/** The most samples one IPC read returns. */
export const WINDOW_SAMPLES = 5 * 60 * 16_000;

const SampleIndex = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
/** Samples `[from, to)` of one track of a take. */
export const TrackRange = Schema.Struct({
  callId: CallId,
  startedAt: RecordingFile.fields.startedAt,
  file: Schema.Literals(["me.wav", "them.wav"]),
  from: SampleIndex,
  to: SampleIndex,
});
export type TrackRange = typeof TrackRange.Type;

/** A call start toast. Its Record button carries all of it, so a press after a restart still knows the call. */
export const CallToast = Schema.Struct({
  projectId: Schema.String.check(Schema.isMaxLength(200)),
  folder: Schema.String.check(Schema.isMaxLength(200)),
  request: RecordRequest,
});
export type CallToast = typeof CallToast.Type;

/** One take of a call, kept beside its `me.wav` and `them.wav` as `recording.json`. */
export const Recording = Schema.Struct({
  callId: Schema.String,
  boardId: Schema.String,
  title: Schema.String,
  app: CallApp,
  exe: Schema.String,
  targetPid: Schema.Number,
  startedAt: Schema.String,
  /** Null while recording, or after the board quit mid-call until the next launch recovers it. */
  endedAt: Schema.NullOr(Schema.String),
  endReason: Schema.NullOr(
    Schema.Literals(["stopped", "target_exited", "max_duration", "error", "crashed", "app_quit"]),
  ),
  error: Schema.NullOr(Schema.String),
  /** 16 kHz mono s16le WAV files on one clock. */
  tracks: Schema.Array(
    Schema.Struct({ who: Schema.Literals(["me", "them"]), file: Schema.String }),
  ),
  deleteAfter: Schema.String,
});
export type Recording = typeof Recording.Type;
