import { ContactRound } from "lucide-react";
import {
  StudentStatusBadge,
  type StudentStatus,
} from "@/components/students/student-status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type StudentDetails = {
  admissionNumber: string;
  studentName: string;
  programme: string;
  contact: string;
  enrolmentDate: string;
  status: StudentStatus;
};

type StudentDetailsPanelProps = {
  student: StudentDetails | null;
};

const detailLabels: Array<{
  key: Exclude<keyof StudentDetails, "status">;
  label: string;
}> = [
  { key: "admissionNumber", label: "Admission number" },
  { key: "studentName", label: "Student name" },
  { key: "programme", label: "Programme / class" },
  { key: "contact", label: "Contact" },
  { key: "enrolmentDate", label: "Enrolment date" },
];

export function StudentDetailsPanel({ student }: StudentDetailsPanelProps) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Student details</CardTitle>
        <p className="text-sm text-muted-foreground">
          Student information will be available when records are connected.
        </p>
      </CardHeader>
      <CardContent>
        {student ? (
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {detailLabels.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  {label}
                </dt>
                <dd className="text-sm font-medium text-foreground">
                  {student[key] || "—"}
                </dd>
              </div>
            ))}
            <div className="space-y-1">
              <dt className="text-xs font-medium text-muted-foreground">
                Status
              </dt>
              <dd>
                <StudentStatusBadge status={student.status} />
              </dd>
            </div>
          </dl>
        ) : (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-5 py-6 text-center">
            <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-background text-muted-foreground shadow-sm">
              <ContactRound aria-hidden="true" className="size-4" />
            </span>
            <p className="text-sm font-medium">No student selected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Student details will appear here when records are available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
