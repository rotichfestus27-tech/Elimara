import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DemoSchool } from "@/config/superadmin-demo-data";

type SchoolDetailsSheetProps = {
  school: DemoSchool | null;
  onOpenChange: (open: boolean) => void;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function SchoolDetailsSheet({
  school,
  onOpenChange,
}: SchoolDetailsSheetProps) {
  return (
    <Sheet
      onOpenChange={onOpenChange}
      open={Boolean(school)}
    >
      <SheetContent
        aria-describedby="school-details-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        {school && (
          <>
            <div className="space-y-2 pr-8">
              <Badge variant="outline">Demonstration record</Badge>
              <SheetTitle className="text-xl">{school.name}</SheetTitle>
              <SheetDescription id="school-details-description">
                Temporary in-memory details. This record is not persisted.
              </SheetDescription>
            </div>

            <dl className="mt-8 divide-y rounded-lg border">
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">
                  Status
                </dt>
                <dd>
                  <Badge variant="secondary">{school.status}</Badge>
                </dd>
              </div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">
                  Contact email
                </dt>
                <dd className="break-all text-sm">
                  {school.contactEmail || "Not provided"}
                </dd>
              </div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">
                  Contact phone
                </dt>
                <dd className="text-sm">
                  {school.contactPhone || "Not provided"}
                </dd>
              </div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">
                  Demonstration date
                </dt>
                <dd className="text-sm">{formatDate(school.createdAt)}</dd>
              </div>
            </dl>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
