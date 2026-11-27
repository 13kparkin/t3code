import type { ForYouCard } from "@agent-board/app/domain/forYou";
import { useAtomValue } from "@effect/atom-react";
import { derivePendingThreadRequests } from "@t3tools/client-runtime/state/thread-requests";
import { EMPTY_ENVIRONMENT_THREAD_STATE } from "@t3tools/client-runtime/state/threads";
import { ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { useMemo } from "react";

import { environmentThreads } from "../state/threads";
import { AppText } from "../AppText";
import { styles } from "../styles";
import { answerApproval, type ForYouTarget } from "./actions";
import { ChoiceButton } from "./ChoiceButton";

/** An approval a child asks for: the command or change, and the choice to run it or not. */
export function ApprovalBody({
  target,
  card,
  sent,
  onError,
}: {
  target: ForYouTarget;
  card: Extract<ForYouCard, { readonly origin: "engine" }>;
  sent: boolean;
  onError: (error: string | null) => void;
}) {
  const { request } = card;
  const thread = useAtomValue(
    environmentThreads.stateAtom(target.environmentId, ThreadId.make(request.threadId)),
  );
  const projection = Option.getOrNull(
    AsyncResult.getOrElse(thread, () => EMPTY_ENVIRONMENT_THREAD_STATE).data,
  );
  const approval = useMemo(
    () =>
      projection === null
        ? undefined
        : derivePendingThreadRequests(projection).approvals.find(
            (entry) => entry.requestId === request.id,
          ),
    [projection, request.id],
  );
  const answer = (decision: "accept" | "decline") => {
    onError(null);
    void answerApproval(target, card, decision).then(onError);
  };
  const detail = approval?.detail ?? approval?.reason;
  return (
    <>
      <AppText style={styles.small}>
        {approval === undefined ? "Loading the request" : `Approval for: ${approval.requestKind}`}
      </AppText>
      {detail !== undefined && (
        <AppText selectable style={styles.card}>
          {detail}
        </AppText>
      )}
      <ChoiceButton
        primary
        disabled={sent || approval === undefined}
        onPress={() => answer("accept")}
      >
        Approve
      </ChoiceButton>
      <ChoiceButton disabled={sent} onPress={() => answer("decline")}>
        Decline
      </ChoiceButton>
    </>
  );
}
