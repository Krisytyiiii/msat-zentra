import { Pill } from "@/components/ui/pill";

export default function TmpPillPage() {
  return (
    <div style={{ padding: 20, width: 420 }}>
      <span className="mt-1 flex max-w-full flex-wrap items-center gap-1.5">
        <Pill className="h-6 leading-none" tone="neutral" label="LRN">
          213123123123
        </Pill>
        <span aria-hidden className="h-3.5 w-px shrink-0 self-center bg-border" />
        <Pill className="h-6 leading-none" tone="green" label="Risk level">
          Low
        </Pill>
      </span>
    </div>
  );
}
