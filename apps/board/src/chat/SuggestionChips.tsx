import { SUGGESTIONS } from "./suggestions";

export function SuggestionChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <ul aria-label="Suggestions" className="flex gap-1.5 overflow-x-auto">
      {SUGGESTIONS.map((suggestion) => (
        <li key={suggestion} className="shrink-0">
          <button
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted shadow-panel hover:text-fg"
          >
            {suggestion}
          </button>
        </li>
      ))}
    </ul>
  );
}
