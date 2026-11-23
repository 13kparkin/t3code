import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

import { GLANCE_LINES } from "./glance";
import { STAGE_LABEL, TICKET_STAGES, type Ticket, type TicketStage } from "./ticket";

const Str = (max: number) => Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(max));
const Stage = Schema.Literals(TICKET_STAGES);
const Stages = Schema.Array(Stage).check(Schema.isMinLength(1));
const LIST_ROWS = 20;

const TextBlock = Schema.Struct({ type: Schema.Literal("text"), text: Str(500) });

const StatBlock = Schema.Struct({
  type: Schema.Literal("stat"),
  label: Str(40),
  value: Schema.optionalKey(Str(40)),
  stages: Schema.optionalKey(Stages),
}).check(
  Schema.makeFilter((block) => (block.value === undefined) !== (block.stages === undefined), {
    message: "needs exactly one of value or stages",
  }),
);

const ListRow = Schema.Struct({
  text: Schema.optionalKey(Str(160)),
  ticket: Schema.optionalKey(Str(40)),
  done: Schema.optionalKey(Schema.Boolean),
}).check(
  Schema.makeFilter((row) => row.text !== undefined || row.ticket !== undefined, {
    message: "needs text or ticket",
  }),
);

const ListBlock = Schema.Struct({
  type: Schema.Literal("list"),
  items: Schema.optionalKey(Schema.Array(ListRow).check(Schema.isMaxLength(LIST_ROWS))),
  stages: Schema.optionalKey(Stages),
}).check(
  Schema.makeFilter((block) => (block.items === undefined) !== (block.stages === undefined), {
    message: "needs exactly one of items or stages",
  }),
);

const Cell = Schema.String.check(Schema.isMaxLength(120));
const TableBlock = Schema.Struct({
  type: Schema.Literal("table"),
  columns: Schema.Array(Cell).check(Schema.isMinLength(1), Schema.isMaxLength(6)),
  rows: Schema.Array(Schema.Array(Cell).check(Schema.isMaxLength(6))).check(Schema.isMaxLength(12)),
});

const LinkBlock = Schema.Struct({
  type: Schema.Literal("link"),
  label: Str(40),
  href: Str(500).check(
    Schema.makeFilter((href) => /^https?:\/\//i.test(href), {
      message: "must be an http or https link",
    }),
  ),
});

const LineBlock = Schema.Union([TextBlock, StatBlock]);
const Block = Schema.Union([TextBlock, StatBlock, ListBlock, TableBlock, LinkBlock]);
export type Block = typeof Block.Type;

const Base = {
  id: Schema.String.check(Schema.isPattern(/^[a-z0-9-]{1,40}$/)),
  title: Str(60),
  asOf: Str(40).check(
    Schema.makeFilter((text) => !Number.isNaN(Date.parse(text)), {
      message: "must be an ISO time",
    }),
  ),
  recipe: Schema.optionalKey(Str(300)),
};
const Blocks = Schema.Array(Block).check(Schema.isMinLength(1), Schema.isMaxLength(8));
const OneLine = Schema.Array(LineBlock).check(Schema.isMinLength(1), Schema.isMaxLength(1));

/** Where an addition draws. `canvas` is a lane of its own after the stage lanes. */
const Addition = Schema.Union([
  Schema.Struct({ ...Base, place: Schema.Literal("canvas"), blocks: Blocks }),
  Schema.Struct({
    ...Base,
    place: Schema.Literal("lane"),
    lane: Schema.Literals(TICKET_STAGES.filter((stage) => stage !== "off_path")),
    blocks: Blocks,
  }),
  Schema.Struct({ ...Base, place: Schema.Literal("ticket"), ticket: Str(40), blocks: Blocks }),
  Schema.Struct({ ...Base, place: Schema.Literal("glance"), ticket: Str(40), blocks: OneLine }),
  Schema.Struct({ ...Base, place: Schema.Literal("orchestrator"), blocks: OneLine }),
]);
export type Addition = typeof Addition.Type;

const MAX_ITEMS = 12;
const PLACE_CAP = {
  canvas: 4,
  lane: MAX_ITEMS,
  ticket: MAX_ITEMS,
  glance: MAX_ITEMS,
  orchestrator: 3,
} as const satisfies Record<Addition["place"], number>;
const GLANCE_LABELS = new Set(GLANCE_LINES.map((line) => line.label));

const decodeFile = Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Array(Schema.Unknown)));
const decodeId = Schema.decodeUnknownOption(Schema.Struct({ id: Schema.String }));
const decodeItem = Schema.decodeUnknownResult(Addition);
const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

export interface ParsedAdditions {
  /** Null when the file is not a JSON array, so the board keeps the last items it could read. */
  readonly items: ReadonlyArray<Addition> | null;
  readonly problems: ReadonlyArray<string>;
}

/** Decodes `additions.json` one item at a time. A bad or over-cap item is skipped and named in a problem, and its siblings still draw. */
export function parseAdditions(text: string): ParsedAdditions {
  const file = decodeFile(text);
  if (Result.isFailure(file)) {
    const reason = formatIssues(file.failure.issue).issues[0]?.message;
    return { items: null, problems: [`additions.json is not a JSON array: ${reason}`] };
  }
  const items: Addition[] = [];
  const problems: string[] = [];
  file.success.forEach((entry, index) => {
    const id = Option.match(decodeId(entry), {
      onNone: () => `#${index}`,
      onSome: (named) => named.id,
    });
    const skip = (why: string) => problems.push(`additions.json "${id}" ${why}`);
    const decoded = decodeItem(entry, { errors: "all" });
    if (Result.isFailure(decoded)) {
      skip(
        formatIssues(decoded.failure.issue)
          .issues.map((issue) => `${issue.path?.join(".") || "(item)"} ${issue.message}`)
          .join("; "),
      );
      return;
    }
    const item = decoded.success;
    if (items.length >= MAX_ITEMS) skip(`(item) is past the ${MAX_ITEMS}-item cap`);
    else if (items.some((other) => other.id === item.id)) skip("id is used by an earlier item");
    else if (items.filter((other) => other.place === item.place).length >= PLACE_CAP[item.place]) {
      skip(`place is past the cap of ${PLACE_CAP[item.place]} ${item.place} items`);
    } else if (
      item.place === "lane" &&
      items.some((other) => other.place === "lane" && other.lane === item.lane)
    ) {
      skip(`lane already has an item: ${item.lane}`);
    } else if (item.place === "glance" && GLANCE_LABELS.has(item.title)) {
      skip(`title is a built-in At a glance line: ${item.title}`);
    } else items.push(item);
  });
  return { items, problems };
}

export const visibleAdditions = (
  items: ReadonlyArray<Addition>,
  hidden: ReadonlyArray<string>,
): ReadonlyArray<Addition> => items.filter((item) => !hidden.includes(item.id));

const isLive = (block: Block) =>
  (block.type === "stat" || block.type === "list") && block.stages !== undefined;

/** An item whose blocks are all live has no snapshot to date. */
export const hasSnapshot = (item: Addition) => !item.blocks.every(isLive);

export interface DrawnRow {
  readonly text: string;
  /** The key of a ticket on the board, which the row opens. */
  readonly ticket?: string;
  readonly done?: boolean;
}

export type DrawnBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "stat"; readonly label: string; readonly value: string }
  | { readonly type: "list"; readonly rows: ReadonlyArray<DrawnRow> }
  | {
      readonly type: "table";
      readonly columns: ReadonlyArray<string>;
      readonly rows: ReadonlyArray<ReadonlyArray<string>>;
    }
  | { readonly type: "link"; readonly label: string; readonly href: string; readonly host: string };

const ticketLine = (ticket: Ticket) =>
  `${ticket.key} ${ticket.title} (${STAGE_LABEL[ticket.stage]})`;

const inStages = (tickets: ReadonlyArray<Ticket>, stages: ReadonlyArray<TicketStage>) =>
  tickets.filter((ticket) => stages.includes(ticket.stage));

/** A block as the board draws it, with `ticket` rows and `stages` read from the current tickets. */
export function resolveBlock(block: Block, tickets: ReadonlyArray<Ticket>): DrawnBlock {
  switch (block.type) {
    case "stat":
      return {
        type: "stat",
        label: block.label,
        value:
          block.stages === undefined
            ? (block.value ?? "")
            : String(inStages(tickets, block.stages).length),
      };
    case "list":
      return {
        type: "list",
        rows:
          block.stages === undefined
            ? (block.items ?? []).map((row): DrawnRow => {
                const ticket = tickets.find((entry) => entry.key === row.ticket);
                const text = [ticket === undefined ? row.ticket : ticketLine(ticket), row.text]
                  .filter((part) => part !== undefined)
                  .join(" · ");
                return {
                  text,
                  ...(ticket === undefined ? {} : { ticket: ticket.key }),
                  ...(row.done === undefined ? {} : { done: row.done }),
                };
              })
            : inStages(tickets, block.stages)
                .slice(0, LIST_ROWS)
                .map((ticket) => ({ text: ticketLine(ticket), ticket: ticket.key })),
      };
    case "link":
      return { type: "link", label: block.label, href: block.href, host: new URL(block.href).host };
    default:
      return block;
  }
}

/** The one-line text of a glance or orchestrator item. */
export function lineText(item: Addition, tickets: ReadonlyArray<Ticket>): string {
  const [block] = item.blocks;
  if (block === undefined) return "";
  const drawn = resolveBlock(block, tickets);
  return drawn.type === "text" ? drawn.text : drawn.type === "stat" ? drawn.value : "";
}
