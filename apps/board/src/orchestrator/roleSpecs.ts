/** The task roles `delegate_task` accepts. */
export type T3Role = "implementation" | "research" | "review" | "design" | "test" | "general";
export type Isolation = "shared" | "worktree";

export interface ClaudeModel {
  readonly slug: string;
  readonly effort: string;
}

export interface RoleSpec {
  readonly name: string;
  readonly t3Role: T3Role;
  readonly isolation: Isolation;
  /** Held only by the role's own file, because T3 cannot limit a child's tools. */
  readonly readOnly: boolean;
  readonly model: ClaudeModel;
}

// Models follow Anthropic's model guide, not omp's settings: routine lanes on Sonnet, security on
// Opus at high, mechanical steps on Haiku. No role uses Fable or xhigh.
const REVIEW: ClaudeModel = { slug: "claude-sonnet-5-5", effort: "medium" };
const SECURITY: ClaudeModel = { slug: "claude-opus-5-5", effort: "high" };
const SCOUT: ClaudeModel = { slug: "claude-sonnet-5-5", effort: "medium" };
const TASK: ClaudeModel = { slug: "claude-sonnet-5-5", effort: "medium" };
const SONIC: ClaudeModel = { slug: "claude-haiku-5-5", effort: "low" };
const DEFAULT: ClaudeModel = { slug: "claude-opus-5-5", effort: "medium" };

const spec = (
  name: string,
  t3Role: T3Role,
  isolation: Isolation,
  readOnly: boolean,
  model: ClaudeModel = DEFAULT,
): RoleSpec => ({ name, t3Role, isolation, readOnly, model });

/** The registry's roles without their files, which Metro can load as well as Vite. */
export const ROLE_SPECS: ReadonlyArray<RoleSpec> = [
  spec("task", "implementation", "worktree", false, TASK),
  spec("scout", "research", "shared", true, SCOUT),
  spec("reviewer", "review", "shared", true, REVIEW),
  spec("security-reviewer", "review", "shared", true, SECURITY),
  spec("sonic", "implementation", "shared", false, SONIC),
  spec("verifier", "test", "shared", false, TASK),
  spec("comment-sicko", "review", "shared", true),
  spec("poteto-agent", "general", "worktree", false),
  spec("egm-bootstrap-orchestrator", "general", "worktree", false),
  spec("egm-codebase-details", "review", "shared", true),
  spec("egm-comprehension", "review", "shared", true),
  spec("egm-design", "design", "shared", true),
  spec("egm-implementation-readiness", "review", "shared", true),
  spec("egm-structural", "review", "shared", true),
  spec("egm-style", "review", "shared", true),
  spec("egm-synthesizer", "general", "shared", false),
  spec("egm-zoom-out", "design", "shared", true),
  spec("call-notes", "research", "shared", true, SCOUT),
];
