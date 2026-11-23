import { type Addition, hasSnapshot, resolveBlock } from "../domain/additions";
import { usePrContext } from "../state/prStatus";
import { ago } from "../ui/ago";
import { DrawnBlockView } from "./DrawnBlockView";

export function AdditionBlocks({ item }: { item: Addition }) {
  const tickets = usePrContext().tickets.map((view) => view.ticket);
  return (
    <div data-testid="addition-blocks" data-addition={item.id} className="flex flex-col gap-2">
      {item.blocks.map((block, at) => (
        // oxlint-disable-next-line react/no-array-index-key -- blocks, rows and cells are positional and their text can repeat
        <DrawnBlockView key={at} block={resolveBlock(block, tickets)} />
      ))}
      {hasSnapshot(item) && <p className="text-[10px] text-faint">as of {ago(item.asOf)}</p>}
    </div>
  );
}
