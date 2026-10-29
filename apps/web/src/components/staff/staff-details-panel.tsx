import { ContactRound } from "lucide-react";
import {
  StaffStatusBadge,
  type StaffProfileStatus,
} from "@/components/staff/staff-status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type StaffDetails = {
  staffNumber: string;
  staffName: string;
  department: string | null;
  positionTitle: string;
  contactEmail: string | null;
  contactPhone: string | null;
  createdAt: string;
  status: StaffProfileStatus;
};

type StaffDetailsPanelProps = {
  staff: StaffDetails | null;
};

const detailLabels: Array<{
  key: Exclude<keyof StaffDetails, "status">;
  label: string;
}> = [
  { key: "staffNumber", label: "Staff number" },
  { key: "staffName", label: "Staff name" },
  { key: "department", label: "Department" },
  { key: "positionTitle", label: "Position title" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "createdAt", label: "Profile created" },
];

export function StaffDetailsPanel({ staff }: StaffDetailsPanelProps) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Staff details</CardTitle>
        <p className="text-sm text-muted-foreground">
          Staff profile fields described by the proposed API contract.
        </p>
      </CardHeader>
      <CardContent>
        {staff ? (
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {detailLabels.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  {label}
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {staff[key] || "—"}
                </dd>
              </div>
            ))}
            <div className="space-y-1">
              <dt className="text-xs font-medium text-muted-foreground">
                Profile status
              </dt>
              <dd>
                <StaffStatusBadge status={staff.status} />
              </dd>
            </div>
          </dl>
        ) : (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 py-6 text-center">
            <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
              <ContactRound aria-hidden="true" className="size-4" />
            </span>
            <p className="text-sm font-medium">No staff member selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Staff details will appear here when real records are available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
