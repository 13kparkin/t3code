import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  resolveProviderSkillsForCwd,
  resolveProviderSlashCommandsForCwd,
  resolveProvidersForCwd,
} from "@t3tools/client-runtime/providerSkills";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { threadSupportsProviderHandoff } from "@t3tools/client-runtime/state/thread-workflows";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import {
  MessageId,
  type OrchestrationV2ThreadProjection,
  ProviderInstanceId,
  type RunId,
  type ThreadId,
} from "@t3tools/contracts";
import { flushSync } from "react-dom";
import {
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { panelAtom } from "../browser/panel";
import { baseInstanceId } from "../orchestrator/orchestratorInstance";
import { NO_PICK, pickableInstances, type PickerValue, pickOf } from "../providers/providers";
import { failureText } from "../settings/failureText";
import { newId } from "../state/boards";
import { engineConnectionAtom } from "../state/projects";
import { engineProvidersAtom, serverEnvironment } from "../state/server";
import { recordDocs } from "../state/attachmentUploads";
import { threadKey, setThreadShown } from "../state/chatThread";
import { cancelQueued, interruptTurn, startTurn, steerQueued } from "../state/threads";
import type { ValidBoard } from "../store/boardFiles";
import { attachmentInputs, pastedFiles } from "./attachments";
import { prepareSend } from "./prepareSend";
import {
  AttachedFiles,
  ComposerActions,
  FailedSends,
  FreshNotice,
  Suggestions,
} from "./ComposerParts";
import { ModelPicker } from "./ModelPicker";
import {
  detectSlashTrigger,
  itemsForTrigger,
  replaceTrigger,
  type SlashAction,
  type SlashItem,
  type SlashTrigger,
  slashMessage,
} from "./slash";
import { MARK_SLASH, SlashMenu, slashOptionId } from "./SlashMenu";
import { cancelTarget, type QueueRow } from "./queue";
import { QueueStrip } from "./QueueStrip";
import type { PendingSend } from "./timeline";
import { useTriggerLookup } from "./triggerLookup";
import { emptyText } from "./triggerLookup.logic";
import { useWorkspaceSnapshot } from "./workspaceSnapshot";

const SWITCH_BLOCKED =
  "This thread does not support switching providers after it has started. Start a new thread to use this model.";

/**
 * The box that sends a message to the orchestrator or stops its turn, with the model picker for the
 * next turn and the menu that opens on a `/`, `$`, `@`, or `#` word anywhere in the message.
 */
export function Composer({
  project,
  listed,
  threadId,
  projection,
  live,
  failed,
  queue,
  steer,
  setSends,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
  threadId: ThreadId;
  projection: OrchestrationV2ThreadProjection | null;
  live: boolean;
  failed: ReadonlyArray<PendingSend>;
  queue: ReadonlyArray<QueueRow>;
  /** The running turn a queued message can be steered into, or null when none can take one. */
  steer: RunId | null;
  setSends: Dispatch<SetStateAction<ReadonlyArray<PendingSend>>>;
}) {
  const registry = useContext(RegistryContext);
  const { environmentId, workspaceRoot: cwd } = project;
  const menuId = useId();
  const input = useRef<HTMLTextAreaElement | null>(null);

  const [draft, setDraft] = useState("");
  const [cursor, setCursor] = useState(0);
  const [active, setActive] = useState(0);
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [override, setOverride] = useState<PickerValue | null>(null);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement | null>(null);
  const shell = useRef<HTMLDivElement | null>(null);
  // Sends the user deleted before they went out, which `deliver` skips.
  const deleted = useRef(new Set<string>());
  // Sends go out one at a time, so a quick follow-up cannot overtake one still uploading files.
  const outbox = useRef<Promise<void>>(Promise.resolve());

  const connected = useAtomValue(engineConnectionAtom).state.phase === "connected";
  const panel = useAtomValue(panelAtom);
  const threadShown = panel.open && panel.tab === "chat";
  const providers = useAtomValue(engineProvidersAtom);
  const providersForCwd = useMemo(() => resolveProvidersForCwd(providers, cwd), [providers, cwd]);
  const instances = useMemo(() => pickableInstances(providersForCwd), [providersForCwd]);
  const thread = projection?.thread ?? null;
  // The thread runs on an orchestrator instance, which the picker shows as the instance it copies.
  const shown =
    override ??
    (thread === null
      ? NO_PICK
      : pickOf(instances, {
          ...thread.modelSelection,
          instanceId: ProviderInstanceId.make(baseInstanceId(thread.modelSelection.instanceId)),
        }));
  const provider = providersForCwd.find((entry) => entry.instanceId === shown.instanceId);
  const { refresh } = useWorkspaceSnapshot(environmentId, provider?.instanceId, cwd);
  const canFresh =
    useAtomValue(serverEnvironment.configValueAtom(environmentId))?.environment.capabilities
      .freshContext === true && (projection?.messages.length ?? 0) > 0;
  const switchBlocked =
    projection !== null &&
    thread !== null &&
    projection.runs.length > 0 &&
    !threadSupportsProviderHandoff(projection)
      ? { reason: SWITCH_BLOCKED, stayOn: baseInstanceId(thread.modelSelection.instanceId) }
      : null;

  const trigger = useMemo(() => detectSlashTrigger(draft, cursor), [draft, cursor]);
  const open = trigger !== null && closedFor !== draft;
  const restIsBlank = draft.slice(cursor).trim() === "";
  const found = useTriggerLookup(project, open ? trigger : null);
  const ranked = useMemo(
    () =>
      open && provider !== undefined
        ? itemsForTrigger({
            trigger,
            restIsBlank,
            commands: resolveProviderSlashCommandsForCwd(provider, cwd),
            skills: resolveProviderSkillsForCwd(provider, cwd),
            canClear: canFresh,
            files: found.files,
            pullRequests: found.pullRequests,
          })
        : [],
    [open, trigger, restIsBlank, provider, cwd, canFresh, found.files, found.pullRequests],
  );
  const highlighted = Math.min(active, Math.max(ranked.length - 1, 0));
  const highlightedItem = open ? ranked[highlighted] : undefined;

  const addFiles = (added: File[]) => {
    const checked = attachmentInputs([...files, ...added]);
    if ("error" in checked) setError(checked.error);
    else {
      setError(null);
      setFiles([...files, ...added]);
    }
  };

  const edit = (value: string, at: number) => {
    const next = trigger === null ? detectSlashTrigger(value, at) : null;
    if (MARK_SLASH && next !== null) performance.mark("board:slash-open");
    if (next?.kind === "command" || next?.kind === "skill") refresh();
    setActive(0);
    setClosedFor(null);
    setDraft(value);
    setCursor(at);
  };

  const runAction = (action: SlashAction, at: SlashTrigger) => {
    const next = replaceTrigger(draft, at, "");
    setDraft(next.text);
    setCursor(next.cursor);
    if (action === "model") setModelOpen(true);
    else setFresh(true);
  };

  const pick = (item: SlashItem) => {
    if (trigger === null) return;
    if (item.action !== null) {
      runAction(item.action, trigger);
      return;
    }
    const next = replaceTrigger(draft, trigger, `${slashMessage(item, "")} `);
    setActive(0);
    // The textarea must hold the text before the cursor can move past it.
    flushSync(() => setDraft(next.text));
    input.current?.setSelectionRange(next.cursor, next.cursor);
    setCursor(next.cursor);
  };

  const settle = (messageId: PendingSend["messageId"], state: PendingSend["state"]) =>
    setSends((all) =>
      all.map((send) => (send.messageId === messageId ? { ...send, state } : send)),
    );

  const fail = (messageId: PendingSend["messageId"], error: string) =>
    settle(messageId, { kind: "failed", error });

  const deliver = async (pending: PendingSend) => {
    if (deleted.current.has(pending.messageId)) return;
    if (projection === null) {
      fail(pending.messageId, "The thread is not loaded yet.");
      return;
    }
    const prepared = await prepareSend(
      registry,
      environmentId,
      pending,
      instances,
      projection.thread.modelSelection.instanceId,
    );
    if ("error" in prepared) {
      fail(pending.messageId, prepared.error);
      return;
    }
    const { selection, attachments } = prepared;
    if (deleted.current.has(pending.messageId)) return;
    const result = await runAtomCommand(
      registry,
      startTurn,
      {
        environmentId,
        input: {
          threadId,
          message: { messageId: pending.messageId, role: "user", text: pending.text, attachments },
          runtimeMode: projection.thread.runtimeMode,
          interactionMode: projection.thread.interactionMode,
          ...(selection === null ? {} : { modelSelection: selection }),
          ...(pending.fresh ? { freshContext: true } : {}),
          // A message sent mid-turn waits in the queue, where it can be deleted, until it is steered in.
          ...(live ? { dispatchMode: "queue" as const } : {}),
        },
      },
      { reportFailure: false },
    );
    if (result._tag !== "Success") fail(pending.messageId, failureText(result));
    else if (attachments.length > 0)
      setError(await recordDocs(registry, project, listed, attachments));
  };

  const enqueue = (pending: PendingSend) => {
    const run = outbox.current.then(() => deliver(pending));
    outbox.current = run.catch(() => undefined);
  };

  const send = (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (text === "") return;
    // A turn sent over a dropped socket waits for it with no sign, so the draft stays for a later send.
    if (!connected || projection === null) {
      setError(
        connected
          ? "The thread is not loaded yet. Your message is kept."
          : "Not connected to the engine. Your message is kept; send it again once the footer reads Engine connected.",
      );
      return;
    }
    const pending: PendingSend = {
      threadId,
      messageId: MessageId.make(newId()),
      text,
      files,
      fresh,
      shown,
      overridden: override !== null,
      state: { kind: "sending" },
    };
    setSends((all) => [...all, pending]);
    setDraft("");
    setCursor(0);
    setFiles([]);
    setFresh(false);
    setError(null);
    enqueue(pending);
    // One short cue that the message went, for when the thread that would show it is hidden.
    const cue = shell.current;
    if (cue !== null && !threadShown) {
      cue.classList.remove("composer-sent");
      void cue.offsetWidth;
      cue.classList.add("composer-sent");
    }
  };

  const retry = (pending: PendingSend) => {
    settle(pending.messageId, { kind: "sending" });
    enqueue(pending);
  };

  const editFailed = (pending: PendingSend) => {
    setSends((all) => all.filter((send) => send.messageId !== pending.messageId));
    const next = draft.trim() === "" ? pending.text : `${pending.text}\n\n${draft}`;
    setDraft(next);
    setCursor(next.length);
    setFiles([...pending.files, ...files]);
    if (pending.fresh) setFresh(true);
  };

  const remove = async (row: QueueRow) => {
    const target = cancelTarget(row);
    if (target === null) return;
    setError(null);
    if (target.kind === "local") {
      deleted.current.add(row.messageId);
      setSends((all) => all.filter((send) => send.messageId !== row.messageId));
      return;
    }
    const result = await runAtomCommand(
      registry,
      cancelQueued,
      { environmentId, input: { threadId, runId: target.runId } },
      { reportFailure: false },
    );
    if (result._tag !== "Success") setError(failureText(result));
  };

  const steerNow = async (row: QueueRow) => {
    if (steer === null || row.runId === null) return;
    setError(null);
    const result = await runAtomCommand(
      registry,
      steerQueued,
      {
        environmentId,
        input: { threadId, queuedRunId: row.runId, targetRunId: steer },
      },
      { reportFailure: false },
    );
    if (result._tag !== "Success") setError(failureText(result));
  };

  const stop = async () => {
    setError(null);
    const result = await runAtomCommand(
      registry,
      interruptTurn,
      { environmentId, input: { threadId } },
      { reportFailure: false },
    );
    if (result._tag !== "Success") setError(failureText(result));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (open && found.status === "pending" && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      return;
    }
    if (open && ranked.length > 0) {
      const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
      if (step !== 0) {
        setActive((highlighted + step + ranked.length) % ranked.length);
        event.preventDefault();
        return;
      }
      const chosen = ranked[highlighted];
      if (chosen !== undefined && (event.key === "Enter" || event.key === "Tab")) {
        if (event.key === "Enter" && event.shiftKey) return;
        pick(chosen);
        event.preventDefault();
        return;
      }
    }
    if (event.key === "Escape" && open) {
      setClosedFor(draft);
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      send();
      event.preventDefault();
    }
  };

  return (
    <form
      onSubmit={send}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        performance.mark("board:attach-drop");
        addFiles(Array.from(event.dataTransfer.files));
      }}
      className="relative flex w-full max-w-xl flex-col gap-1.5"
    >
      {open && (
        <SlashMenu
          id={menuId}
          items={ranked}
          empty={emptyText(found.status, trigger?.kind)}
          active={highlighted}
          onPick={pick}
          onHover={setActive}
        />
      )}
      <QueueStrip rows={queue} canSteer={steer !== null} onDelete={remove} onSteer={steerNow} />
      <FailedSends failed={failed} onRetry={retry} onEdit={editFailed} />
      {error !== null && (
        <p role="alert" className="mb-1.5 break-words text-red-400">
          {error}
        </p>
      )}
      {fresh && <FreshNotice onCancel={() => setFresh(false)} />}
      {draft === "" && files.length === 0 && (
        <Suggestions
          onPick={(text) => {
            edit(text, text.length);
            input.current?.focus();
          }}
        />
      )}
      <div
        ref={shell}
        data-testid="composer-shell"
        className="flex flex-col gap-1 rounded-2xl border border-line bg-panel p-2 shadow-panel focus-within:border-muted"
      >
        {files.length > 0 && (
          <AttachedFiles
            files={files}
            onRemove={(at) => setFiles(files.filter((_, i) => i !== at))}
          />
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            value={draft}
            onChange={(event) => edit(event.target.value, event.target.selectionStart)}
            onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              const pasted = pastedFiles(
                Array.from(event.clipboardData.files),
                event.clipboardData.getData("text/plain"),
              );
              if (pasted.length === 0) return;
              event.preventDefault();
              addFiles(pasted);
            }}
            rows={2}
            placeholder="Message the orchestrator"
            aria-label="Message the orchestrator"
            role="combobox"
            aria-expanded={open}
            aria-controls={open && ranked.length > 0 ? menuId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              highlightedItem === undefined ? undefined : slashOptionId(menuId, highlightedItem)
            }
            className="field-sizing-content max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent text-fg outline-none placeholder:text-faint"
          />
          <ComposerActions
            picker={picker}
            threadShown={threadShown}
            stopping={live && draft.trim() === ""}
            canSend={draft.trim() !== ""}
            onAttach={addFiles}
            onToggleThread={() =>
              void setThreadShown(registry, threadKey(project.id, listed.folder), !threadShown)
            }
            onStop={() => void stop()}
          />
        </div>
        <ModelPicker
          instances={instances}
          value={shown}
          onChange={setOverride}
          switchBlocked={switchBlocked}
          open={modelOpen}
          onOpenChange={(next) => {
            setModelOpen(next);
            if (!next) input.current?.focus();
          }}
        />
      </div>
    </form>
  );
}
