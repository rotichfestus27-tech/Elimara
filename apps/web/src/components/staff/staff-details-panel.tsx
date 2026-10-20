import { ContactRound } from "lucide-react";
import {
  StaffStatusBadge,
  type StaffEmploymentStatus,
} from "@/components/staff/staff-status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type StaffDetails = {
  staffId: string;
  staffName: string;
  department: string;
  position: string;
  category: "Teaching" | "Non-Teaching";
  email: string;
  phone: string;
  dateHired: string;
  employmentStatus: StaffEmploymentStatus;
};

type StaffDetailsPanelProps = {
  staff: StaffDetails | null;
};

const detailLabels: Array<{
  key: Exclude<keyof StaffDetails, "employmentStatus">;
  label: string;
}> = [
  { key: "staffId", label: "Staff ID" },
  { key: "staffName", label: "Staff name" },
  { key: "department", label: "Department" },
  { key: "position", label: "Position" },
  { key: "category", label: "Category" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone number" },
  { key: "dateHired", label: "Date hired" },
];

export function StaffDetailsPanel({ staff }: StaffDetailsPanelProps) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Staff details</CardTitle>
        <p className="text-sm text-muted-foreground">
          Staff information will be available when records are connected.
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
                Employment status
              </dt>
              <dd>
                <StaffStatusBadge status={staff.employmentStatus} />
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
