export interface BoardProject<P> {
  readonly project: P;
  readonly error: string | null;
}

/** Keeps the projects that hold a board or failed to answer, in order, or one error when none answered. */
export function foldBoardScan<P>(
  projects: ReadonlyArray<P>,
  outcomes: ReadonlyArray<boolean | Error>,
): ReadonlyArray<BoardProject<P>> | Error {
  const [first] = outcomes;
  if (first instanceof Error && outcomes.every((outcome) => outcome instanceof Error)) return first;
  return projects.flatMap((project, index): Array<BoardProject<P>> => {
    const outcome = outcomes[index];
    if (outcome instanceof Error) return [{ project, error: outcome.message }];
    return outcome === true ? [{ project, error: null }] : [];
  });
}
