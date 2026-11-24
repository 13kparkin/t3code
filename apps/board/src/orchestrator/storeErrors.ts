/**
 * Which store errors to send the orchestrator now, and which count as sent after. An error is sent
 * once while the orchestrator runs. It is sent again only after it leaves the list, as when its file
 * turns valid or its text changes.
 */
export function storeErrorsToSend(
  sent: ReadonlySet<string>,
  errors: ReadonlyArray<string>,
  live: boolean,
) {
  const send = live ? errors.filter((error) => !sent.has(error)) : [];
  return { send, sent: new Set(errors.filter((error) => sent.has(error) || live)) };
}

export const storeErrorMessage = (error: string): string =>
  `The board could not read a file you wrote. Fix the file so the board shows your update.\n${error}`;
