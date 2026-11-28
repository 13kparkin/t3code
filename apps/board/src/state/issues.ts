import { createIssueTrackerEnvironmentAtoms } from "@t3tools/client-runtime/state/issue-trackers";
import { createIssueEnvironmentAtoms } from "@t3tools/client-runtime/state/issues";
import { createEnvironmentRpcCommand, runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import {
  type EnvironmentId,
  type IssueDetail,
  type IssueRef,
  WS_METHODS,
} from "@t3tools/contracts";
import type { AtomRegistry } from "effect/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";
import type { TrackerCall } from "../issues/issueLinks";
import { failureText } from "../settings/failureText";

export const issueEnvironment = createIssueEnvironmentAtoms(connectionAtomRuntime);
export const issueTrackerEnvironment = createIssueTrackerEnvironmentAtoms(connectionAtomRuntime);

const readDetail = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "board:issues:read-detail",
  tag: WS_METHODS.issuesDetail,
});

export async function readIssueDetail(
  registry: AtomRegistry.AtomRegistry,
  environmentId: EnvironmentId,
  ref: IssueRef,
): Promise<IssueDetail> {
  const detail = await runAtomCommand(
    registry,
    readDetail,
    { environmentId, input: ref },
    { reportFailure: false },
  );
  if (detail._tag !== "Success") throw new Error(failureText(detail));
  return detail.value;
}

export async function runTrackerCall(
  registry: AtomRegistry.AtomRegistry,
  environmentId: EnvironmentId,
  call: TrackerCall,
): Promise<string> {
  const options = { reportFailure: false } as const;
  switch (call.operation) {
    case "create": {
      const result = await runAtomCommand(
        registry,
        issueEnvironment.create,
        { environmentId, input: call.input },
        options,
      );
      if (result._tag !== "Success") throw new Error(failureText(result));
      return `Created ${result.value.displayKey}: ${result.value.url}`;
    }
    case "setState": {
      const result = await runAtomCommand(
        registry,
        issueEnvironment.setState,
        { environmentId, input: call.input },
        options,
      );
      if (result._tag !== "Success") throw new Error(failureText(result));
      return `Moved ${call.input.key} to "${call.input.state}"`;
    }
    case "comment": {
      const result = await runAtomCommand(
        registry,
        issueEnvironment.comment,
        { environmentId, input: call.input },
        options,
      );
      if (result._tag !== "Success") throw new Error(failureText(result));
      return `Commented on ${call.input.key}`;
    }
  }
}
