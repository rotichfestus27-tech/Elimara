import { Link } from "react-router";
import { useAuth } from "@/app/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSchoolList } from "@/lib/api/school-data";

const applicationStatuses = [
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "ADMITTED", label: "Admitted" },
] as const;

type ApplicationStatus = (typeof applicationStatuses)[number]["value"];

function useStatusCount(status: ApplicationStatus, enabled: boolean) {
  return useSchoolList<{ id: string }>(
    "/admission-applications",
    { limit: 1, offset: 0, status },
    { enabled },
  );
}

export function AdmissionsPipeline() {
  const { school } = useAuth();
  const canReadAdmissions = school?.permissions.includes("admissions.application.read") ?? false;
  const draftQuery = useStatusCount("DRAFT", canReadAdmissions);
  const submittedQuery = useStatusCount("SUBMITTED", canReadAdmissions);
  const reviewQuery = useStatusCount("UNDER_REVIEW", canReadAdmissions);
  const acceptedQuery = useStatusCount("ACCEPTED", canReadAdmissions);
  const rejectedQuery = useStatusCount("REJECTED", canReadAdmissions);
  const withdrawnQuery = useStatusCount("WITHDRAWN", canReadAdmissions);
  const admittedQuery = useStatusCount("ADMITTED", canReadAdmissions);
  const queries = [
    draftQuery,
    submittedQuery,
    reviewQuery,
    acceptedQuery,
    rejectedQuery,
    withdrawnQuery,
    admittedQuery,
  ];

  return (
    <section aria-labelledby="admissions-pipeline-heading" className="space-y-4">
      <div>
        <h3 id="admissions-pipeline-heading" className="text-base font-semibold">
          Admissions pipeline
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Application totals by status for the active school.
        </p>
      </div>
      {!canReadAdmissions ? (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          Status totals are unavailable without admissions read permission.
        </p>
      ) : (
        <Card className="shadow-none">
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {applicationStatuses.map((status, index) => {
                const query = queries[index];
                return (
                  <fieldset className="rounded-md border p-3" key={status.value}>
                    <legend className="px-1 text-sm text-muted-foreground">
                      {status.label} applications
                    </legend>
                    <p className="mt-1 text-xl font-semibold">
                      {query.isLoading
                        ? "Loading..."
                        : query.isError || query.data?.meta.total === undefined
                          ? "Unavailable"
                          : query.data.meta.total}
                    </p>
                    {query.isError && (
                      <Button
                        className="mt-2 h-auto px-0 py-1 text-xs"
                        onClick={() => void query.refetch()}
                        size="sm"
                        variant="link"
                      >
                        Retry {status.label.toLowerCase()} count
                      </Button>
                    )}
                  </fieldset>
                );
              })}
            </div>
            {queries.some((query) => query.isError) && (
              <p className="text-sm text-destructive" role="alert">
                One or more application status totals could not be loaded.
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-3 text-sm">
              <Link
                className="font-medium text-primary underline-offset-4 hover:underline"
                to="/admissions"
              >
                Review applications
              </Link>
              {school?.permissions.includes("students.profile.read") && (
                <Link
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  to="/students"
                >
                  Student registrations
                </Link>
              )}
              {school?.permissions.includes("guardians.profile.read") &&
                school.permissions.includes("students.profile.read") && (
                  <span className="text-muted-foreground">
                    Guardian records are available through student profiles.
                  </span>
                )}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
