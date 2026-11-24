import { X } from "lucide-react";

import { AttachmentThumb } from "./AttachmentThumb";

const markShown = (chip: HTMLElement | null) => {
  if (chip !== null) performance.mark("board:attach-shown");
};

export function AttachedFiles({
  files,
  onRemove,
}: {
  files: ReadonlyArray<File>;
  onRemove: (index: number) => void;
}) {
  return (
    <ul aria-label="Attached files" className="flex flex-wrap gap-1">
      {files.map((file, index) => (
        <li
          key={`${file.name}:${file.lastModified}:${file.size}`}
          ref={markShown}
          className="flex max-w-full items-center gap-1 rounded-md border border-line bg-hover px-1.5 text-[11px] leading-5 text-fg"
        >
          <AttachmentThumb file={file} />
          <span className="min-w-0 truncate">{file.name}</span>
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            onClick={() => onRemove(index)}
            className="text-muted hover:text-fg"
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
