export function FreshNotice({ onCancel }: { onCancel: () => void }) {
  return (
    <p className="mb-1.5 flex items-center gap-2 text-muted">
      <span className="min-w-0 flex-1">The next message starts a fresh session.</span>
      <button type="button" onClick={onCancel} className="hover:text-fg">
        Cancel
      </button>
    </p>
  );
}
