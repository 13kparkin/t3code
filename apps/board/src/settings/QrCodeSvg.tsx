import { QrCode } from "@t3tools/shared/qrCode";

/** One path of dark runs per row, as T3's own QR code draws it. */
function pathData(qr: QrCode, margin: number) {
  const commands: string[] = [];
  for (let y = 0; y < qr.size; y += 1) {
    let start = -1;
    for (let x = 0; x <= qr.size; x += 1) {
      if (x < qr.size && qr.getModule(x, y)) {
        if (start === -1) start = x;
      } else if (start !== -1) {
        commands.push(`M${start + margin} ${y + margin}h${x - start}v1H${start + margin}z`);
        start = -1;
      }
    }
  }
  return commands.join("");
}

export function QrCodeSvg({ value, title }: { value: string; title: string }) {
  const qr = QrCode.encodeText(value, QrCode.Ecc.MEDIUM);
  const margin = 2;
  const box = qr.size + margin * 2;
  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      width={160}
      height={160}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
    >
      <rect width={box} height={box} fill="#fff" />
      <path d={pathData(qr, margin)} fill="#000" />
    </svg>
  );
}
