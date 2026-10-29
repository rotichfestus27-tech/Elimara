import { Activity, Clock3 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ActivityPanel() {
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold leading-none tracking-tight">
            Activity and alerts
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No approved school-wide activity or alert feed is connected.
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Clock3 aria-hidden="true" className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 py-8 text-center">
          <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
            <Activity aria-hidden="true" className="size-[18px]" />
          </span>
          <h4 className="text-sm font-medium">Feed unavailable</h4>
          <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">
            No activity events or alerts are shown until an approved source is
            available. No sample data is being shown.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
