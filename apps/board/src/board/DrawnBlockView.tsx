import { RegistryContext } from "@effect/atom-react";
import { Square, SquareCheck } from "lucide-react";
import { useContext } from "react";

import { openInBrowser } from "../browser/browserTabs";
import { chooseTicket } from "../browser/panel";
import type { DrawnBlock } from "../domain/additions";

/** Every value is a React text node, never markup. */
export function DrawnBlockView({ block }: { block: DrawnBlock }) {
  const registry = useContext(RegistryContext);
  switch (block.type) {
    case "text":
      return <p className="whitespace-pre-wrap break-words">{block.text}</p>;
    case "stat":
      return (
        <dl>
          <dt className="text-[10px] leading-tight text-faint">{block.label}</dt>
          <dd className="text-fg">{block.value}</dd>
        </dl>
      );
    case "list":
      return (
        <ul className="flex flex-col gap-0.5">
          {block.rows.map((row, at) => {
            const Check = row.done ? SquareCheck : Square;
            const { ticket } = row;
            return (
              // oxlint-disable-next-line react/no-array-index-key -- blocks, rows and cells are positional and their text can repeat
              <li key={at} className="flex min-w-0 items-start gap-1.5">
                {row.done !== undefined && (
                  <Check
                    className="mt-0.5 size-3 shrink-0 text-muted"
                    aria-label={row.done ? "Done" : "Not done"}
                  />
                )}
                {ticket === undefined ? (
                  <span className="min-w-0 break-words">{row.text}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => chooseTicket(registry, { threadId: null, ticketKey: ticket })}
                    className="min-w-0 text-left break-words text-fg underline decoration-dotted hover:text-accent"
                  >
                    {row.text}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="text-[12px]">
            <thead>
              <tr>
                {block.columns.map((column, at) => (
                  // oxlint-disable-next-line react/no-array-index-key -- blocks, rows and cells are positional and their text can repeat
                  <th key={at} className="pr-3 text-left font-semibold text-muted">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, at) => (
                // oxlint-disable-next-line react/no-array-index-key -- blocks, rows and cells are positional and their text can repeat
                <tr key={at}>
                  {row.map((cell, column) => (
                    // oxlint-disable-next-line react/no-array-index-key -- blocks, rows and cells are positional and their text can repeat
                    <td key={column} className="pr-3 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "link":
      return (
        <p className="min-w-0 truncate">
          <a
            href={block.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.preventDefault();
              openInBrowser(block.href);
            }}
            className="text-focus underline underline-offset-2"
          >
            {block.label}
          </a>{" "}
          <span className="text-[11px] text-faint">{block.host}</span>
        </p>
      );
  }
}
