import type { ReactNode } from "react";

import { DOC_BODY, DOC_COLUMN, DOC_HEADING, DOC_LEAD, DOC_TITLE } from "./docStyles";

export interface DocSection {
  readonly id: string;
  /** A section with no title reads as the page's body and leaves no outline entry. */
  readonly title?: string;
  readonly body: ReactNode;
}

/** The outline earns its place only on a page with this many named sections. */
const OUTLINE_MIN = 3;

/** A view that covers the canvas, laid out as a reading page: one column, a title, headed sections. */
export function DocPage({
  title,
  lead,
  sections,
}: {
  title: ReactNode;
  lead?: ReactNode;
  sections: ReadonlyArray<DocSection>;
}) {
  const named = sections.filter((section) => section.title !== undefined);
  const anchor = (id: string) => `doc-${id}`;
  return (
    <div
      data-testid="doc-page"
      className="@container min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both"
    >
      <div className="flex justify-center">
        <article className={DOC_COLUMN}>
          <h1 className={DOC_TITLE}>{title}</h1>
          {lead !== undefined && <div className={DOC_LEAD}>{lead}</div>}
          {sections.map((section) => (
            <section
              key={section.id}
              id={anchor(section.id)}
              aria-label={section.title}
              className={`mt-10 scroll-mt-6 ${DOC_BODY}`}
            >
              {section.title !== undefined && (
                <h2 className={`mb-3 ${DOC_HEADING}`}>{section.title}</h2>
              )}
              {section.body}
            </section>
          ))}
        </article>
        {named.length >= OUTLINE_MIN && (
          <nav
            aria-label="On this page"
            className="sticky top-0 hidden w-44 shrink-0 self-start pt-14 pr-8 @min-[1100px]:block"
          >
            <p className="mb-2 text-xs font-semibold text-muted">On this page</p>
            <ul className="flex flex-col gap-1.5">
              {named.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById(anchor(section.id))
                        ?.scrollIntoView({ block: "start" })
                    }
                    className="text-left text-xs text-muted hover:text-fg"
                  >
                    {section.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
