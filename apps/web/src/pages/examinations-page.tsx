import { useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { AssessmentEditor } from "@/components/examinations/assessment-editor";
import { AssessmentLifecycle } from "@/components/examinations/assessment-lifecycle";
import type { Assessment, AssessmentStatus } from "@/components/examinations/assessment-types";
import { StudentReportCard } from "@/components/examinations/student-report-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/ui/data-states";
import { ApiClientError } from "@/lib/api/client";
import { useSchoolList } from "@/lib/api/school-data";

const statuses: Array<{ value: AssessmentStatus; label: string }> = [
  { value: "DRAFT", label: "Draft" },
  { value: "OPEN", label: "Open" },
  { value: "MODERATION", label: "Moderation" },
  { value: "FINALIZED", label: "Finalized" },
  { value: "PUBLISHED", label: "Published" },
];

const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type ActionMessage = { message: string; kind: "success" | "error" } | null;

export function ExaminationsPage() {
  const { school } = useAuth();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("all");
  const [termId, setTermId] = useState("all");
  const [actionMessage, setActionMessage] = useState<ActionMessage>(null);
  const canReadAssessments = Boolean(school?.permissions.includes("assessments.read"));
  const canManage = Boolean(school?.permissions.includes("assessments.manage"));
  const assessments = useSchoolList<Assessment>(
    "/assessments",
    {
      limit: 100,
      offset: 0,
      status: status === "all" ? undefined : status,
    },
    { enabled: canReadAssessments },
  );

  const loadedAssessments = assessments.data?.data ?? [];
  const classIds = [...new Set(loadedAssessments.map(({ classId }) => classId))].sort();
  const termIds = [...new Set(loadedAssessments.map(({ termId }) => termId))].sort();
  const searchTerm = search.trim().toLocaleLowerCase();
  const visibleAssessments = loadedAssessments.filter((assessment) => {
    const matchesSearch =
      !searchTerm ||
      [
        assessment.name,
        assessment.subjectName,
        assessment.classId,
        assessment.streamId ?? "",
        assessment.termId,
      ].some((value) => value.toLocaleLowerCase().includes(searchTerm));

    return (
      matchesSearch &&
      (classId === "all" || assessment.classId === classId) &&
      (termId === "all" || assessment.termId === termId)
    );
  });

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setClassId("all");
    setTermId("all");
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-sm font-medium text-primary">Assessment</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Assessments and results
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Review assessment schedules and result completion, manage verified result lifecycle
          actions, and view published report cards for authorized school students.
        </p>
      </section>

      <Card className="shadow-none">
        <CardContent className="space-y-5 p-4 sm:p-5">
          {actionMessage && (
            <p
              aria-live={actionMessage.kind === "error" ? "assertive" : "polite"}
              className={`rounded-md border p-3 text-sm ${
                actionMessage.kind === "error"
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "border-emerald-600/30 bg-emerald-600/5"
              }`}
              role={actionMessage.kind === "error" ? "alert" : "status"}
            >
              {actionMessage.message}
            </p>
          )}
          {canManage && canReadAssessments && !assessments.isPending && !assessments.isError && (
            <div className="flex justify-end">
              <AssessmentEditor
                onSaved={(message) => setActionMessage({ message, kind: "success" })}
              />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Search</span>
              <input
                autoComplete="off"
                className={controlClassName}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, subject, class, stream, or term ID"
                type="search"
                value={search}
              />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Assessment status</span>
              <select
                className={controlClassName}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setClassId("all");
                  setTermId("all");
                }}
                value={status}
              >
                <option value="all">All statuses</option>
                {statuses.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Class</span>
              <select
                className={controlClassName}
                onChange={(event) => setClassId(event.target.value)}
                value={classId}
              >
                <option value="all">All classes</option>
                {classIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Academic term</span>
              <select
                className={controlClassName}
                onChange={(event) => setTermId(event.target.value)}
                value={termId}
              >
                <option value="all">All terms</option>
                {termIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!canReadAssessments ? (
            <UnauthorizedState
              description="The server-returned school permissions do not include assessment read access."
              title="Assessment access unavailable"
            />
          ) : assessments.isPending ? (
            <LoadingState className="min-h-40" message="Loading assessments..." />
          ) : assessments.isError && isPermissionDenied(assessments.error) ? (
            <UnauthorizedState
              description="Your current school access does not allow assessment data to be viewed. Contact a school administrator if you believe this is incorrect."
              title="Assessment access denied"
            />
          ) : assessments.isError ? (
            <ErrorState
              message="Assessments could not be loaded. Please try again."
              onRetry={() => void assessments.refetch()}
            />
          ) : loadedAssessments.length === 0 ? (
            <EmptyState
              className="min-h-40 justify-center"
              description="Assessments will appear here when they are available for this school."
              title="No assessments found"
            />
          ) : visibleAssessments.length === 0 ? (
            <EmptyState
              action={
                <Button className="mt-4" onClick={resetFilters} variant="outline">
                  Clear filters
                </Button>
              }
              className="min-h-40 justify-center"
              description="Try another search term or adjust the selected filters."
              title="No matching assessments"
            />
          ) : (
            <section aria-label="Assessment list" className="space-y-3">
              <div aria-live="polite" className="text-xs text-muted-foreground">
                Showing {visibleAssessments.length} of {loadedAssessments.length} loaded
                assessments. The API reports {assessments.data.meta.total} matching the selected
                status.
                {assessments.data.meta.total > loadedAssessments.length &&
                  " Search and class/term filters apply to the loaded records."}
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {visibleAssessments.map((assessment) => (
                  <AssessmentCard
                    assessment={assessment}
                    canManage={canManage}
                    key={assessment.id}
                    onSaved={(message) => setActionMessage({ message, kind: "success" })}
                    onLifecycleMessage={(message, kind) =>
                      setActionMessage(message ? { message, kind } : null)
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </CardContent>
      </Card>
      <StudentReportCard />
    </div>
  );
}

function AssessmentCard({
  assessment,
  canManage,
  onSaved,
  onLifecycleMessage,
}: {
  assessment: Assessment;
  canManage: boolean;
  onSaved: (message: string) => void;
  onLifecycleMessage: (message: string, kind: "success" | "error") => void;
}) {
  const statusLabel = statuses.find(({ value }) => value === assessment.status)?.label;

  return (
    <Card className="shadow-none">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="break-words font-semibold">{assessment.name}</h2>
            <p className="text-sm text-muted-foreground">{assessment.subjectName}</p>
          </div>
          <Badge className="w-fit shrink-0" variant="outline">
            {statusLabel ?? assessment.status}
          </Badge>
        </div>

        <dl className="grid gap-x-4 gap-y-3 border-y py-4 text-sm sm:grid-cols-2">
          <AssessmentDetail label="Class ID" value={assessment.classId} />
          <AssessmentDetail label="Stream" value={assessment.streamId ?? "No stream specified"} />
          <AssessmentDetail label="Academic term ID" value={assessment.termId} />
          <AssessmentDetail
            label="Assessment date"
            value={formatAssessmentDates(assessment.startsOn, assessment.endsOn)}
          />
        </dl>

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <p>
            Results entered:{" "}
            <span className="font-semibold">
              {assessment.enteredCount} / {assessment.eligibleCount}
            </span>
          </p>
          <p>
            Missing: <span className="font-semibold">{assessment.missingCount}</span>
          </p>
        </div>
        <AssessmentLifecycle assessment={assessment} onMessage={onLifecycleMessage} />
        {canManage && assessment.status === "DRAFT" && (
          <div className="flex justify-end border-t pt-3">
            <AssessmentEditor assessment={assessment} onSaved={onSaved} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AssessmentDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-xs">{value}</dd>
    </div>
  );
}

function formatAssessmentDates(startsOn: string, endsOn: string) {
  const format = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  return startsOn === endsOn ? format(startsOn) : `${format(startsOn)} – ${format(endsOn)}`;
}

function isPermissionDenied(error: Error | null): boolean {
  return error instanceof ApiClientError && error.status === 403;
}
