import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SummaryCardItem = {
  title: string;
  description: string;
  icon: LucideIcon;
  value?: string | number;
  subtext?: string;
};

type SummaryCardProps = {
  item: SummaryCardItem;
};

export function SummaryCard({ item }: SummaryCardProps) {
  const Icon = item.icon;
  const hasValue = item.value !== undefined;

  return (
    <Card className="shadow-none transition-colors hover:border-primary/30">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
          <p className="text-xs leading-5 text-muted-foreground">
            {item.description}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
        </span>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "text-2xl font-semibold tracking-tight",
            hasValue ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {hasValue ? (
            item.value
          ) : (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">No data available</span>
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.subtext || (hasValue ? "Updated live from database" : "Awaiting data connection")}
        </p>
      </CardContent>
    </Card>
  );
}
