import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "@/components/ui/data-states";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import { type ApiPage, useSchoolData } from "@/lib/api/school-data";
import type { Assessment, AssessmentStatus } from "./assessment-types";

type AssessmentResult = {
  id: string;
  studentId: string;
  studentAdmissionNumber: string;
  studentGivenName: string;
  studentFamilyName: string;
  score: string | null;
  maximumScore: string;
  percentage: string | null;
  gradeCode: string | null;
  gradeLabel: string | null;
  enteredAt: string | null;
  updatedAt: string;
};

type ResultsPage = ApiPage<AssessmentResult> & {
  meta: ApiPage<AssessmentResult>["meta"] & { missingCount: number };
};

type Transition = "open" | "submit-for-moderation" | "finalize" | "publish";

const transitionResultStatus: Record<Transition, AssessmentStatus> = {
  open: "OPEN",
  "submit-for-moderation": "MODERATION",
  finalize: "FINALIZED",
  publish: "PUBLISHED",
};

const statusLabels: Record<AssessmentStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  MODERATION: "Submitted for review",
  FINALIZED: "Finalized",
  PUBLISHED: "Published",
};

const transitionCopy: Record<
  Transition,
  { title: string; description: string; button: string; success: string }
> = {
  open: {
    title: "Open this assessment?",
    description:
      "Opening moves this draft into the mark-entry phase. The server will enforce the assessment state and your school permission.",
    button: "Open assessment",
    success: "Assessment opened for mark entry.",
  },
  "submit-for-moderation": {
    title: "Submit assessment for review?",
    description:
      "This will move the assessment from Open to Moderation. The backend does not provide a separate reviewer assignment or approval decision.",
    button: "Submit for review",
    success: "Assessment submitted for review.",
  },
  finalize: {
    title: "Finalize assessment results?",
    description:
      "Finalization moves this assessment from Moderation to Finalized. Finalized results are locked until an authorized correction workflow reopens them.",
    button: "Finalize results",
    success: "Assessment results finalized.",
  },
  publish: {
    title: "Publish assessment results?",
    description:
      "This makes finalized results available through the report-card API. The backend will reject publication if any roster marks are missing.",
    button: "Publish results",
    success: "Assessment published.",
  },
};

export function AssessmentLifecycle({
  assessment,
  onMessage,
}: {
  assessment: Assessment;
  onMessage: (message: string, kind: "success" | "error") => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const [showResults, setShowResults] = useState(false);
  const [confirmation, setConfirmation] = useState<Transition | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [pageOffset, setPageOffset] = useState(0);
  const canRead = Boolean(school?.permissions.includes("assessments.read"));
  const canManage = Boolean(school?.permissions.includes("assessments.manage"));
  const canSubmit = Boolean(school?.permissions.includes("results.moderate"));
  const canFinalize = Boolean(school?.permissions.includes("results.finalize"));
  const canPublish = Boolean(school?.permissions.includes("results.publish"));
  const canViewResults = ["OPEN", "MODERATION", "FINALIZED", "PUBLISHED"].includes(
    assessment.status,
  );
  const shouldLoadResults = showResults && canViewResults && canRead;
  const resultsQuery = useSchoolData<ResultsPage>(
    `/assessments/${encodeURIComponent(assessment.id)}/marks`,
    { limit: 100, offset: pageOffset },
    { enabled: shouldLoadResults },
  );
  const resultsReadFailed = shouldLoadResults && resultsQuery.isError;

  async function runTransition() {
    if (!confirmation || !school || pendingRef.current) return;
    const transition = confirmation;
    pendingRef.current = true;
    setPending(true);
    onMessage("", "success");
    try {
      const response = await apiRequest<{ data: Assessment }>(
        `/schools/${encodeURIComponent(school.id)}/assessments/${encodeURIComponent(assessment.id)}/${transition}`,
        { method: "POST" },
      );
      await queryClient.invalidateQueries({ queryKey: ["school-data", school.id] });
      if (response.data.status !== transitionResultStatus[transition]) {
        onMessage(
          `The request returned status ${response.data.status}, not the expected ${transitionResultStatus[transition]}. The assessment list was refreshed; verify its current state before trying again.`,
          "error",
        );
        setConfirmation(null);
        return;
      }
      onMessage(
        transition === "publish"
          ? `${transitionCopy[transition].success} Status: ${response.data.status}.`
          : transitionCopy[transition].success,
        "success",
      );
      setConfirmation(null);
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? [
              ...(error.status === 403
                ? [
                    "The server denied this action. Your current school permissions may not allow it.",
                  ]
                : []),
              error.message,
              ...error.issues.map((issue) =>
                issue.path ? `${issue.path}: ${issue.message}` : issue.message,
              ),
            ].join(" ")
          : error instanceof Error
            ? error.message
            : "The assessment could not be updated.";
      onMessage(message, "error");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const transitionInfo = confirmation ? transitionCopy[confirmation] : null;
  const canRequestOpen = assessment.status === "DRAFT" && canManage;
  const canRequestReview = assessment.status === "OPEN" && canSubmit;
  const canRequestFinalize = assessment.status === "MODERATION" && canFinalize;
  const canRequestPublish = assessment.status === "FINALIZED" && canPublish;
  const resultsButtonLabel =
    assessment.status === "OPEN"
      ? "View current results"
      : assessment.status === "MODERATION"
        ? "View submitted results"
        : assessment.status === "PUBLISHED"
          ? "View published results"
          : "View finalized results";

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Lifecycle status</p>
          <p aria-live="polite" className="text-sm font-semibold" role="status">
            {statusLabels[assessment.status]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {assessment.status === "DRAFT" &&
            (canRequestOpen ? (
              <Button
                disabled={pending}
                onClick={() => setConfirmation("open")}
                size="sm"
                variant="outline"
              >
                Open assessment
              </Button>
            ) : (
              <p className="self-center text-xs text-muted-foreground">
                Read-only: assessment management permission required to open.
              </p>
            ))}
          {assessment.status === "OPEN" &&
            (canRequestReview ? (
              <Button
                disabled={pending}
                onClick={() => setConfirmation("submit-for-moderation")}
                size="sm"
                variant="outline"
              >
                Submit for review
              </Button>
            ) : (
              <p className="self-center text-xs text-muted-foreground">
                {canSubmit
                  ? "No review action is available in this state."
                  : "Read-only: submission permission required."}
              </p>
            ))}
          {canViewResults && canRead && (
            <Button
              onClick={() => {
                setPageOffset(0);
                setShowResults((visible) => !visible);
              }}
              size="sm"
              variant="outline"
            >
              {showResults ? "Hide results" : resultsButtonLabel}
            </Button>
          )}
          {assessment.status === "MODERATION" &&
            (canRequestFinalize && !resultsReadFailed ? (
              <Button
                disabled={pending || assessment.missingCount > 0}
                onClick={() => setConfirmation("finalize")}
                size="sm"
                variant="outline"
              >
                Finalize results
              </Button>
            ) : (
              <p className="self-center text-xs text-muted-foreground">
                {canFinalize
                  ? resultsReadFailed
                    ? "Finalization is unavailable until the result roster can be loaded."
                    : "No finalization action is available in this state."
                  : "Read-only: finalization permission required."}
              </p>
            ))}
          {assessment.status === "FINALIZED" &&
            (canRequestPublish && !resultsReadFailed ? (
              <Button
                disabled={pending || assessment.missingCount > 0}
                onClick={() => setConfirmation("publish")}
                size="sm"
                variant="outline"
              >
                Publish results
              </Button>
            ) : (
              <p className="self-center text-xs text-muted-foreground">
                {canPublish
                  ? resultsReadFailed
                    ? "Publication is unavailable until the result roster can be loaded."
                    : "No publication action is available in this state."
                  : "Read-only: publication permission required."}
              </p>
            ))}
        </div>
      </div>

      {["MODERATION", "FINALIZED"].includes(assessment.status) && assessment.missingCount > 0 && (
        <p className="text-xs text-muted-foreground" role="status">
          {assessment.status === "FINALIZED" ? "Publication" : "Finalization"} is unavailable while{" "}
          {assessment.missingCount} result
          {assessment.missingCount === 1 ? " is" : "s are"} missing.
        </p>
      )}

      {shouldLoadResults && (
        <div className="space-y-3">
          <p className="rounded-md border border-amber-600/30 bg-amber-600/5 p-3 text-xs leading-5 text-muted-foreground">
            The API returns the full roster for this school assessment. It does not apply
            reviewer-assignment or teacher-assignment scoping to these result rows.
          </p>
          <ResultsList
            heading={
              assessment.status === "OPEN"
                ? "Current results"
                : assessment.status === "MODERATION"
                  ? "Submitted results"
                  : assessment.status === "PUBLISHED"
                    ? "Published results"
                    : "Finalized results"
            }
            onNext={() => setPageOffset((offset) => offset + 100)}
            onPrevious={() => setPageOffset((offset) => Math.max(0, offset - 100))}
            query={resultsQuery}
          />
        </div>
      )}

      <Dialog
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(null);
        }}
        open={Boolean(confirmation)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transitionInfo?.title}</DialogTitle>
            <DialogDescription>{transitionInfo?.description}</DialogDescription>
          </DialogHeader>
          {["finalize", "publish"].includes(confirmation ?? "") && assessment.missingCount > 0 && (
            <p className="text-sm text-destructive" role="alert">
              {assessment.missingCount} marks are missing. The backend will not complete this
              lifecycle transition while results are incomplete.
            </p>
          )}
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => setConfirmation(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                pending ||
                (["finalize", "publish"].includes(confirmation ?? "") &&
                  assessment.missingCount > 0)
              }
              onClick={() => void runTransition()}
              type="button"
            >
              {pending ? "Saving..." : transitionInfo?.button}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultsList({
  heading,
  onNext,
  onPrevious,
  query,
}: {
  heading: string;
  onNext: () => void;
  onPrevious: () => void;
  query: ReturnType<typeof useSchoolData<ResultsPage>>;
}) {
  if (query.isPending) {
    return (
      <LoadingState className="min-h-32" message={`Loading ${heading.toLocaleLowerCase()}...`} />
    );
  }

  if (query.isError && query.error instanceof ApiClientError && query.error.status === 403) {
    return (
      <UnauthorizedState
        className="py-4"
        description="The backend did not authorize access to these assessment results."
        title="Results access denied"
      />
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        className="py-4"
        message={`${heading} could not be loaded.`}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const page = query.data;

  if (page.data.length === 0) {
    if (page.meta.total > 0 || page.meta.missingCount > 0) {
      return (
        <ErrorState
          className="py-4"
          message={`The results page returned no rows, but the API reports ${page.meta.total} eligible students and ${page.meta.missingCount} missing marks. Please try again.`}
          onRetry={() => void query.refetch()}
        />
      );
    }

    return (
      <EmptyState
        className="py-6"
        description="There are no result rows to display for this assessment."
        title="No assessment results"
      />
    );
  }

  return (
    <Card className="shadow-none">
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="text-sm font-semibold">{heading}</div>
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Results {page.meta.offset + 1}–{page.meta.offset + page.data.length} of{" "}
            {page.meta.total}
          </span>
          <span>{page.meta.missingCount} missing</span>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table aria-label={heading} className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium" scope="col">
                  Student
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Admission number
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Score
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Percentage
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Grade
                </th>
              </tr>
            </thead>
            <tbody>
              {page.data.map((result) => (
                <tr className="border-t" key={result.id}>
                  <td className="px-3 py-2 font-medium">
                    {result.studentGivenName} {result.studentFamilyName}
                  </td>
                  <td className="px-3 py-2">{result.studentAdmissionNumber}</td>
                  <td className="px-3 py-2">
                    {result.score === null ? "Missing" : `${result.score} / ${result.maximumScore}`}
                  </td>
                  <td className="px-3 py-2">
                    {result.percentage === null ? "—" : `${result.percentage}%`}
                  </td>
                  <td className="px-3 py-2">
                    {formatGrade(result.gradeCode, result.gradeLabel)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            disabled={page.meta.offset === 0}
            onClick={onPrevious}
            size="sm"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={page.meta.offset + page.data.length >= page.meta.total}
            onClick={onNext}
            size="sm"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatGrade(gradeCode: string | null, gradeLabel: string | null) {
  if (gradeCode && gradeLabel) return `${gradeCode} — ${gradeLabel}`;
  return gradeCode ?? gradeLabel ?? "—";
}
