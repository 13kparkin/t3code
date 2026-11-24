import { describe, expect, it } from "vite-plus/test";

import { storeErrorsToSend } from "./storeErrors";

const BAD = "tickets.json is invalid: 90.worktreePath Expected string";

describe("store errors sent to the orchestrator", () => {
  it("Given a parse error, when the store is polled twice, then one message is sent", () => {
    const first = storeErrorsToSend(new Set(), [BAD], true);
    const second = storeErrorsToSend(first.sent, [BAD], true);
    expect([first.send, second.send]).toEqual([[BAD], []]);
  });

  it("Given the orchestrator is not running, when it starts, then the error is sent then", () => {
    const idle = storeErrorsToSend(new Set(), [BAD], false);
    const started = storeErrorsToSend(idle.sent, [BAD], true);
    expect([idle.send, started.send]).toEqual([[], [BAD]]);
  });

  it("Given a sent error, when the file turns valid and breaks again, then it is sent again", () => {
    const sent = storeErrorsToSend(new Set(), [BAD], true).sent;
    const valid = storeErrorsToSend(sent, [], true);
    expect(storeErrorsToSend(valid.sent, [BAD], true).send).toEqual([BAD]);
  });

  it("Given a sent error, when its text changes, then the new text is sent", () => {
    const sent = storeErrorsToSend(new Set(), [BAD], true).sent;
    const changed = `${BAD.slice(0, -6)}number`;
    expect(storeErrorsToSend(sent, [changed], true).send).toEqual([changed]);
  });
});
