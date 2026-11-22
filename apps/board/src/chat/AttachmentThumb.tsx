import { useMemo } from "react";

export function AttachmentThumb({ file }: { file: File }) {
  const url = useMemo(
    () => (file.type.toLowerCase().startsWith("image/") ? URL.createObjectURL(file) : null),
    [file],
  );
  if (url === null) return null;
  // The decoded image outlives the object URL, so release it once loaded.
  return (
    <img
      src={url}
      alt=""
      onLoad={() => URL.revokeObjectURL(url)}
      onError={() => URL.revokeObjectURL(url)}
      className="size-5 shrink-0 rounded-sm object-cover"
    />
  );
}
