import {
  getProviderSkillsForSlashMenu,
  getProviderSlashCommandsForSlashMenu,
} from "@t3tools/client-runtime/providerSkills";
import {
  detectComposerPullRequestTrigger,
  isCurrencyAmountQuery,
  isPathWord,
  serializeComposerFileLink,
} from "@t3tools/shared/composerTrigger";
import type {
  ProjectEntry,
  PullRequestListEntry,
  ServerProviderSkill,
  ServerProviderSlashCommand,
} from "@t3tools/contracts";

export type SlashGroup = "command" | "skill" | "action" | "file" | "pull-request";

/** The composer actions T3's own chat offers, which the board runs itself. */
export type SlashAction = "model" | "clear";

export interface SlashItem {
  readonly id: string;
  readonly group: SlashGroup;
  readonly name: string;
  /** What the menu shows. */
  readonly label: string;
  /** What picking it types into the message. */
  readonly insert: string;
  readonly description: string;
  /** The argument the command takes, as the engine describes it. */
  readonly hint: string | null;
  readonly action: SlashAction | null;
}

export const GROUP_ORDER: ReadonlyArray<SlashGroup> = [
  "command",
  "skill",
  "action",
  "file",
  "pull-request",
];

export const GROUP_TITLE = {
  command: "Commands",
  skill: "Skills",
  action: "T3 actions",
  file: "Files",
  "pull-request": "Pull requests",
} satisfies Record<SlashGroup, string>;

const ACTIONS = {
  model: { description: "Switch response model for this thread" },
  clear: { description: "Start a fresh session; earlier messages stay visible" },
} satisfies Record<SlashAction, { readonly description: string }>;

/**
 * The menu's items for one instance. A command that a visible skill shares its name with is left
 * out, as in T3, and so is one that a T3 action shares its name with, such as `/model`. `/compact` runs only as the whole
 * message, so it goes once the message has other text.
 */
export function buildSlashItems(input: {
  readonly commands: ReadonlyArray<ServerProviderSlashCommand>;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
  readonly actions: ReadonlyArray<SlashAction>;
  readonly messageIsOnlyTheCommand: boolean;
}): ReadonlyArray<SlashItem> {
  const skills = getProviderSkillsForSlashMenu(input.skills, true);
  const commands = getProviderSlashCommandsForSlashMenu(input.commands, skills).filter(
    (command) =>
      (command.name !== "compact" || input.messageIsOnlyTheCommand) &&
      !input.actions.some((action) => action === command.name),
  );
  return [
    ...commands.map((command): SlashItem => ({
      id: `command:${command.name}`,
      group: "command",
      name: command.name,
      label: `/${command.name}`,
      insert: `/${command.name}`,
      description: command.description ?? command.input?.hint ?? "Run provider command",
      hint: command.input?.hint ?? null,
      action: null,
    })),
    ...skills.map((skill): SlashItem => ({
      id: `skill:${skill.name}`,
      group: "skill",
      name: skill.name,
      label: `$${skill.name}`,
      insert: `$${skill.name}`,
      description:
        skill.shortDescription ??
        skill.description ??
        (skill.scope ? `${skill.scope} skill` : "Run provider skill"),
      hint: null,
      action: null,
    })),
    ...input.actions.map((action): SlashItem => ({
      id: `action:${action}`,
      group: "action",
      name: action,
      label: `/${action}`,
      insert: `/${action}`,
      description: ACTIONS[action].description,
      hint: null,
      action,
    })),
  ];
}

const WORD_BREAK = /[\s\-_:/.]+/;

const startsAWord = (text: string, query: string) =>
  text
    .toLowerCase()
    .split(WORD_BREAK)
    .some((word) => word.startsWith(query));

/** 0 for a name that starts with the query, 1 for a name or description with a word that does, null for no match. */
function tier(item: SlashItem, query: string): 0 | 1 | null {
  if (item.name.toLowerCase().startsWith(query)) return 0;
  return startsAWord(item.name, query) || startsAWord(item.description, query) ? 1 : null;
}

/**
 * The items a query keeps. Names that start with the query come first, then the ones with a word
 * that does. Inside each of those, items are grouped as commands, then skills, then T3 actions, in
 * the order the engine listed them. An empty query keeps every item, grouped the same way.
 */
export function rankSlashItems(
  items: ReadonlyArray<SlashItem>,
  query: string,
): ReadonlyArray<SlashItem> {
  const needle = query.trim().toLowerCase();
  const byGroup = GROUP_ORDER.flatMap((group) => items.filter((item) => item.group === group));
  if (needle === "") return byGroup;
  const ranks = new Map(byGroup.map((item) => [item, tier(item, needle)]));
  return [0, 1].flatMap((rank) => byGroup.filter((item) => ranks.get(item) === rank));
}

export interface SlashTrigger {
  readonly kind: "command" | "skill" | "file" | "pull-request";
  readonly query: string;
  readonly rangeStart: number;
  readonly rangeEnd: number;
}

const isBlank = (char: string) => char === " " || char === "\n" || char === "\t" || char === "\r";

/** Mirrors T3's `detectComposerTrigger`. */
export function detectSlashTrigger(text: string, cursor: number): SlashTrigger | null {
  const rangeEnd = cursor;
  let rangeStart = rangeEnd;
  while (rangeStart > 0 && !isBlank(text[rangeStart - 1] ?? "")) rangeStart -= 1;
  const token = text.slice(rangeStart, rangeEnd);
  if (token.startsWith("/")) {
    return isPathWord(text, rangeStart, rangeEnd, isBlank)
      ? null
      : { kind: "command", query: token.slice(1), rangeStart, rangeEnd };
  }
  const pullRequest = detectComposerPullRequestTrigger(token, rangeEnd);
  if (pullRequest) return pullRequest;
  const symbol = /^\p{Sc}/u.exec(token)?.[0];
  if (symbol !== undefined) {
    const query = token.slice(symbol.length);
    return isCurrencyAmountQuery(query) ? null : { kind: "skill", query, rangeStart, rangeEnd };
  }
  return token.startsWith("@")
    ? { kind: "file", query: token.slice(1), rangeStart, rangeEnd }
    : null;
}

const MAX_PULL_REQUESTS = 50;

/** Pull requests whose number contains a numeric query, the exact number first, then the most recently updated. */
function pullRequestItems(entries: ReadonlyArray<PullRequestListEntry>, query: string) {
  const isNumber = /^\d+$/.test(query);
  const updated = (entry: PullRequestListEntry) => Date.parse(entry.updatedAt) || 0;
  const exact = (entry: PullRequestListEntry) => Number(String(entry.number) === query);
  return entries
    .filter((entry) => !isNumber || String(entry.number).includes(query))
    .toSorted((a, b) => exact(b) - exact(a) || updated(b) - updated(a))
    .slice(0, MAX_PULL_REQUESTS)
    .map((entry): SlashItem => ({
      id: `pull-request:${entry.url}`,
      group: "pull-request",
      name: String(entry.number),
      label: `#${entry.number}`,
      insert: entry.url,
      description: entry.title,
      hint: null,
      action: null,
    }));
}

function fileItems(entries: ReadonlyArray<ProjectEntry>) {
  return entries.map((entry): SlashItem => {
    const name = entry.path.slice(entry.path.lastIndexOf("/") + 1);
    return {
      id: `file:${entry.path}`,
      group: "file",
      name,
      label: name,
      insert: serializeComposerFileLink(entry.path),
      description: entry.path,
      hint: null,
      action: null,
    };
  });
}

/**
 * What the menu lists for a trigger. `$` lists skills only. Provider commands and `/clear` run only
 * when the `/` word starts the message, and `/compact` only when it is the whole message, as in T3.
 * `@` and `#` list what the engine found, which it has already ranked.
 */
export function itemsForTrigger(input: {
  readonly trigger: SlashTrigger;
  readonly restIsBlank: boolean;
  readonly commands: ReadonlyArray<ServerProviderSlashCommand>;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
  readonly canClear: boolean;
  readonly files: ReadonlyArray<ProjectEntry>;
  readonly pullRequests: ReadonlyArray<PullRequestListEntry>;
}) {
  const { trigger } = input;
  const atStart = trigger.rangeStart === 0;
  switch (trigger.kind) {
    case "file":
      return fileItems(input.files);
    case "pull-request":
      return pullRequestItems(input.pullRequests, trigger.query);
    case "skill":
      return rankSlashItems(
        buildSlashItems({
          commands: [],
          skills: input.skills,
          actions: [],
          messageIsOnlyTheCommand: false,
        }),
        trigger.query,
      );
    case "command":
      return rankSlashItems(
        buildSlashItems({
          commands: atStart ? input.commands : [],
          skills: input.skills,
          actions: ["model", ...(input.canClear && atStart ? (["clear"] as const) : [])],
          messageIsOnlyTheCommand: atStart && input.restIsBlank,
        }),
        trigger.query,
      );
  }
}

/** A space after the word is swallowed when the replacement ends in a space, or is empty and leaves a space or the message start before it. */
export function replaceTrigger(text: string, trigger: SlashTrigger, replacement: string) {
  const before = text.slice(0, trigger.rangeStart);
  const after = text.slice(trigger.rangeEnd);
  const joinsSpace =
    replacement === "" ? before === "" || before.endsWith(" ") : replacement.endsWith(" ");
  return {
    text: before + replacement + (joinsSpace && after.startsWith(" ") ? after.slice(1) : after),
    cursor: trigger.rangeStart + replacement.length,
  };
}

/** The message a picked item sends, with its argument after it. A T3 action sends no message. */
export function slashMessage(item: SlashItem, argument: string): string {
  if (item.action !== null) return "";
  const text = argument.trim();
  return text === "" ? item.insert : `${item.insert} ${text}`;
}
