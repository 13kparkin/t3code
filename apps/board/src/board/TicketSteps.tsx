import { Check, Circle, type LucideIcon, SkipForward } from "lucide-react";

import { missingPlan, STAGE_LABEL, stepProgress, type TicketStep } from "../domain/ticket";
import type { SectionProps } from "./sectionProps";

const STEP_ICON = {
  done: { Icon: Check, tone: "text-emerald-400", label: "Done" },
  pending: { Icon: Circle, tone: "text-faint", label: "Pending" },
  skipped: { Icon: SkipForward, tone: "text-amber-400", label: "Skipped" },
} as const satisfies Record<TicketStep["state"], { Icon: LucideIcon; tone: string; label: string }>;

export function TicketSteps({ view }: SectionProps) {
  const { ticket } = view;
  const steps = ticket.steps ?? [];
  const progress = stepProgress(ticket);
  return (
    <div>
      {missingPlan(ticket) && (
        <p data-testid="plan-missing" className="mb-1 text-amber-300">
          No plan. In {STAGE_LABEL[ticket.stage]} without a playbook and steps.
        </p>
      )}
      <p className="mb-1 text-[11px] text-muted">
        Playbook {ticket.playbook ?? "none"}
        {progress !== null && ` · ${progress.done} of ${progress.total} done`}
      </p>
      <ul aria-label="Playbook steps" data-testid="ticket-steps" className="flex flex-col gap-2">
        {steps.map((step, index) => {
          const { Icon, tone, label } = STEP_ICON[step.state];
          return (
            // oxlint-disable-next-line react/no-array-index-key -- the row holds no state and step text can repeat
            <li key={index} data-state={step.state} className="flex gap-1.5">
              <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} aria-label={label} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] leading-4 break-words text-fg">{step.text}</p>
                {step.state === "skipped" && step.note != null && (
                  <p className="text-[11px] break-words text-amber-300">Skipped: {step.note}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
