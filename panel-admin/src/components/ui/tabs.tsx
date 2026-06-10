import { cn } from "@/lib/utils";

/** Simple controlled tabs bar (shadcn look, no radix needed). */
export function TabsBar<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all",
            value === tab.value && "bg-background text-foreground shadow",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
