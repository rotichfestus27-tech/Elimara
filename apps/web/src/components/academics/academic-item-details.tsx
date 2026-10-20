import { BookOpenCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AcademicStatusBadge,
  type AcademicStatus,
} from "@/components/academics/academic-status-badge";

export type AcademicItemDetails = {
  name: string;
  code?: string;
  programmeOrClass?: string;
  qualificationOrLevel?: string;
  duration?: string;
  startDate?: string;
  endDate?: string;
  status: AcademicStatus;
};

type AcademicItemDetailsProps = {
  item: AcademicItemDetails | null;
};

export function AcademicItemDetailsPanel({
  item,
}: AcademicItemDetailsProps) {
  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Academic item details</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            View information for an academic structure item.
          </p>
        </div>
        <Badge variant="outline">Preview</Badge>
      </CardHeader>
      <CardContent>
        {item ? (
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {Object.entries(item)
              .filter(([key]) => key !== "status")
              .map(([key, value]) => (
              <div key={key} className="space-y-1">
                <dt className="text-xs font-medium capitalize text-muted-foreground">
                  {key.replace(/([A-Z])/g, " $1")}
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {value || "—"}
                </dd>
              </div>
              ))}
            <div className="space-y-1">
              <dt className="text-xs font-medium text-muted-foreground">
                Status
              </dt>
              <dd>
                <AcademicStatusBadge status={item.status} />
              </dd>
            </div>
          </dl>
        ) : (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 py-6 text-center">
            <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
              <BookOpenCheck aria-hidden="true" className="size-4" />
            </span>
            <p className="text-sm font-medium">No item selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Details will appear here when academic records are available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
