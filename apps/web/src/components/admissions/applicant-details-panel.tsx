import { FileText } from "lucide-react";
import {
  type ApplicationStatus,
  ApplicationStatusBadge,
} from "@/components/admissions/application-status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type ApplicantDetails = {
  applicantName: string;
  applicationNumber: string;
  programme: string;
  submissionDate: string;
  status: ApplicationStatus;
  academicYear?: string;
};

type ApplicantDetailsPanelProps = {
  application: ApplicantDetails | null;
};

const detailLabels: Array<{
  key: keyof ApplicantDetails;
  label: string;
}> = [
  { key: "applicantName", label: "Applicant" },
  { key: "applicationNumber", label: "Application number" },
  { key: "programme", label: "Programme" },
  { key: "submissionDate", label: "Submission date" },
  { key: "academicYear", label: "Academic year" },
];

export function ApplicantDetailsPanel({
  application,
}: ApplicantDetailsPanelProps) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Application details</CardTitle>
        <p className="text-sm text-muted-foreground">
          Applicant information will be available when application data is
          connected.
        </p>
      </CardHeader>
      <CardContent>
        {application ? (
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {detailLabels.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  {label}
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {application[key] || "—"}
                </dd>
              </div>
            ))}
            <div className="space-y-1">
              <dt className="text-xs font-medium text-muted-foreground">
                Status
              </dt>
              <dd>
                <ApplicationStatusBadge status={application.status} />
              </dd>
            </div>
          </dl>
        ) : (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 py-6 text-center">
            <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
              <FileText aria-hidden="true" className="size-4" />
            </span>
            <p className="text-sm font-medium">No application selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Application details will appear here when records are available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
