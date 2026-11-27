import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import type { MessageId, ThreadId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

interface CodeSpan {
  readonly code: boolean;
  readonly text: string;
}

// A fence needs a newline after its info string, so "```a```" stays an inline span.
const CODE = /```[^\n`]*\n([\s\S]*?)\n?```|`([^`\n]+)`/g;

/** An unclosed fence stays plain text. */
export function codeSpans(text: string): ReadonlyArray<CodeSpan> {
  const spans: CodeSpan[] = [];
  let at = 0;
  for (const match of text.matchAll(CODE)) {
    if (match.index > at) spans.push({ code: false, text: text.slice(at, match.index) });
    spans.push({ code: true, text: match[1] ?? match[2] ?? "" });
    at = match.index + match[0].length;
  }
  if (at < text.length) spans.push({ code: false, text: text.slice(at) });
  return spans;
}

const NOT_STREAMING = Atom.make(null).pipe(Atom.withLabel("phone-chat-not-streaming"));

/** Swapping to the null atom when blurred or backgrounded drops the subscription, which closes the stream. */
export const chatStream = <A>(
  stream: Atom.Atom<A>,
  focused: boolean,
  active: boolean,
): Atom.Atom<A | null> => (focused && active ? stream : NOT_STREAMING);

export const userTurn = (
  thread: { readonly id: ThreadId } & Pick<StartThreadTurnInput, "runtimeMode" | "interactionMode">,
  messageId: MessageId,
  text: string,
): StartThreadTurnInput => ({
  threadId: thread.id,
  message: { messageId, role: "user", text, attachments: [] },
  runtimeMode: thread.runtimeMode,
  interactionMode: thread.interactionMode,
});
