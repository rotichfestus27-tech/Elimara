import { Activity, Clock3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ActivityPanel() {
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            A summary of what is happening across your school.
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
          <h4 className="text-sm font-medium">Nothing to show yet</h4>
          <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">
            Recent activity will appear here when school data is connected.
            This preview does not contain sample activity.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
