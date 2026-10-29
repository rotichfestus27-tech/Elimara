import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { FormField } from "@/components/students/form-field";
import { Button } from "@/components/ui/button";
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
import { useSchoolData, useSchoolList } from "@/lib/api/school-data";
import type { Assessment } from "./assessment-types";

type AcademicYear = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
};

type Term = AcademicYear & { academicYearId: string };
type AcademicClass = { id: string; academicYearId: string; name: string };
type ClassStream = { id: string; classId: string; name: string };
type Subject = { id: string; name: string };
type ClassSubjectAssignment = { id: string; classId: string; subjectId: string };
type GradingScale = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };

type AssessmentInput = {
  academicYearId: string;
  termId: string;
  classId: string;
  streamId?: string;
  classSubjectAssignmentId: string;
  gradingScaleId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  maximumScore: string;
};

type AssessmentEditorProps = {
  assessment?: Assessment;
  onSaved: (message: string) => void;
};

type LoadableQuery = {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function AssessmentEditor({ assessment, onSaved }: AssessmentEditorProps) {
  const { school } = useAuth();
  const canManage = Boolean(school?.permissions.includes("assessments.manage"));
  const [open, setOpen] = useState(false);

  if (!canManage) return null;

  function handleSaved(message: string) {
    setOpen(false);
    onSaved(message);
  }

  return (
    <>
      <Button
        aria-label={assessment ? `Edit ${assessment.name}` : "Create assessment"}
        onClick={() => setOpen(true)}
        size={assessment ? "sm" : "default"}
        variant={assessment ? "outline" : "default"}
      >
        {assessment ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {assessment ? "Edit draft" : "Create assessment"}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {assessment ? "Edit draft assessment" : "Schedule assessment"}
            </DialogTitle>
            <DialogDescription>
              Set the academic context, eligible class-subject assignment, dates, and grading scale.
              The server snapshots the active student roster when the assessment is saved.
            </DialogDescription>
          </DialogHeader>
          <AssessmentEditorContent
            assessment={assessment}
            onSaved={handleSaved}
            schoolId={school?.id ?? ""}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function AssessmentEditorContent({
  assessment,
  onSaved,
  schoolId,
}: AssessmentEditorProps & { schoolId: string }) {
  const { school } = useAuth();
  const canReadAssessments = Boolean(school?.permissions.includes("assessments.read"));
  const canReadConfiguration = Boolean(
    school?.permissions.includes("academics.configuration.read"),
  );

  if (!canReadAssessments || !canReadConfiguration) {
    return (
      <UnauthorizedState
        description="Assessment creation needs access to grading scales, and the form needs academic configuration access to load years, terms, classes, and subjects. Ask a school administrator to review your permissions."
        title="Required reference data is unavailable"
      />
    );
  }

  return <AssessmentForm assessment={assessment} onSaved={onSaved} schoolId={schoolId} />;
}

function AssessmentForm({
  assessment,
  onSaved,
  schoolId,
}: AssessmentEditorProps & { schoolId: string }) {
  const queryClient = useQueryClient();
  const [academicYearId, setAcademicYearId] = useState(assessment?.academicYearId ?? "");
  const [termId, setTermId] = useState(assessment?.termId ?? "");
  const [classId, setClassId] = useState(assessment?.classId ?? "");
  const [streamId, setStreamId] = useState(assessment?.streamId ?? "");
  const [classSubjectAssignmentId, setClassSubjectAssignmentId] = useState(
    assessment?.classSubjectAssignmentId ?? "",
  );
  const [gradingScaleId, setGradingScaleId] = useState(assessment?.gradingScaleId ?? "");
  const [name, setName] = useState(assessment?.name ?? "");
  const [startsOn, setStartsOn] = useState(assessment?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(assessment?.endsOn ?? "");
  const [maximumScore, setMaximumScore] = useState(assessment?.maximumScore ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState<ApiClientError | Error | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const yearsQuery = useSchoolList<AcademicYear>("/academic-years", {
    limit: 100,
    offset: 0,
    status: "ACTIVE",
  });
  const scalesQuery = useSchoolData<{ data: GradingScale[] }>("/grading-scales");
  const effectiveYearId = academicYearId || yearsQuery.data?.data[0]?.id || "";
  const termsQuery = useSchoolList<Term>(
    "/terms",
    { academicYearId: effectiveYearId, limit: 100, offset: 0, status: "ACTIVE" },
    { enabled: Boolean(effectiveYearId) },
  );
  const classesQuery = useSchoolList<AcademicClass>(
    "/classes",
    { academicYearId: effectiveYearId, limit: 100, offset: 0, status: "ACTIVE" },
    { enabled: Boolean(effectiveYearId) },
  );
  const streamsQuery = useSchoolList<ClassStream>(
    "/streams",
    { classId, limit: 100, offset: 0, status: "ACTIVE" },
    { enabled: Boolean(classId) },
  );
  const assignmentsQuery = useSchoolList<ClassSubjectAssignment>(
    "/class-subjects",
    { classId, limit: 100, offset: 0, status: "ACTIVE" },
    { enabled: Boolean(classId) },
  );
  const subjectsQuery = useSchoolList<Subject>("/subjects", {
    limit: 100,
    offset: 0,
    status: "ACTIVE",
  });

  const years = yearsQuery.data?.data ?? [];
  const terms = termsQuery.data?.data ?? [];
  const classes = classesQuery.data?.data ?? [];
  const streams = streamsQuery.data?.data ?? [];
  const assignments = assignmentsQuery.data?.data ?? [];
  const subjects = subjectsQuery.data?.data ?? [];
  const scales = (scalesQuery.data?.data ?? []).filter((scale) => scale.status === "ACTIVE");
  const selectedYear = years.find((year) => year.id === effectiveYearId);
  const selectedTerm = terms.find((term) => term.id === termId);

  useEffect(() => {
    if (!academicYearId && years[0]) setAcademicYearId(years[0].id);
  }, [academicYearId, years]);

  useEffect(() => {
    if (Object.keys(fieldErrors).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [fieldErrors]);

  const requiredQueries: LoadableQuery[] = [
    yearsQuery,
    scalesQuery,
    subjectsQuery,
    ...(effectiveYearId ? [termsQuery, classesQuery] : []),
    ...(classId ? [streamsQuery, assignmentsQuery] : []),
  ];
  const queryFailures = requiredQueries.filter((query) => query.isError);
  const queriesLoading = requiredQueries.some((query) => query.isPending);
  const referencesAvailable =
    years.length > 0 && terms.length > 0 && classes.length > 0 && scales.length > 0;

  function validate(): AssessmentInput | null {
    const errors: Record<string, string> = {};
    if (!academicYearId) errors.academicYearId = "Select an active academic year.";
    if (!termId) errors.termId = "Select an active term.";
    if (!classId) errors.classId = "Select an active class.";
    if (!classSubjectAssignmentId) errors.classSubjectAssignmentId = "Select an assigned subject.";
    if (!gradingScaleId) errors.gradingScaleId = "Select an active grading scale.";
    if (!name.trim()) errors.name = "Enter an assessment name.";
    else if (name.trim().length > 120)
      errors.name = "Assessment name must be 120 characters or fewer.";
    if (!startsOn) errors.startsOn = "Select a start date.";
    if (!endsOn) errors.endsOn = "Select an end date.";
    if (startsOn && endsOn && startsOn > endsOn)
      errors.endsOn = "End date must be on or after start date.";
    if (
      selectedYear &&
      startsOn &&
      endsOn &&
      (startsOn < selectedYear.startsOn || endsOn > selectedYear.endsOn)
    ) {
      errors.startsOn = "Assessment dates must be within the selected academic year.";
    }
    if (
      selectedTerm &&
      startsOn &&
      endsOn &&
      (startsOn < selectedTerm.startsOn || endsOn > selectedTerm.endsOn)
    ) {
      errors.startsOn = "Assessment dates must be within the selected academic term.";
    }
    if (
      !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,4})?$/.test(maximumScore) ||
      !Number.isFinite(Number(maximumScore)) ||
      Number(maximumScore) <= 0
    ) {
      errors.maximumScore = "Enter a positive score with up to four decimal places.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return null;

    return {
      academicYearId,
      termId,
      classId,
      ...(streamId ? { streamId } : {}),
      classSubjectAssignmentId,
      gradingScaleId,
      name: name.trim(),
      startsOn,
      endsOn,
      maximumScore,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    setRequestError(null);
    const body = validate();
    if (!body) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const path = assessment
        ? `/schools/${encodeURIComponent(schoolId)}/assessments/${encodeURIComponent(assessment.id)}`
        : `/schools/${encodeURIComponent(schoolId)}/assessments`;
      await apiRequest<{ data: Assessment }>(path, {
        method: assessment ? "PATCH" : "POST",
        body,
      });
      await queryClient.invalidateQueries({ queryKey: ["school-data", schoolId] });
      onSaved(assessment ? "Draft assessment updated." : "Assessment scheduled.");
    } catch (error) {
      setRequestError(
        error instanceof Error ? error : new Error("The assessment could not be saved."),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function renderQueryFailure(query: LoadableQuery, label: string) {
    if (!query.isError) return null;
    const denied = query.error instanceof ApiClientError && query.error.status === 403;
    return denied ? (
      <UnauthorizedState
        className="items-start text-left"
        description={`${label} cannot be loaded with your current school access.`}
        title="Reference data access denied"
      />
    ) : (
      <ErrorState
        className="items-start text-left"
        message={`${label} could not be loaded.`}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (queriesLoading) {
    return <LoadingState className="min-h-40" message="Loading assessment options..." />;
  }

  if (queryFailures.length > 0) {
    return (
      <div className="space-y-3">
        {renderQueryFailure(yearsQuery, "Academic years")}
        {renderQueryFailure(scalesQuery, "Grading scales")}
        {renderQueryFailure(subjectsQuery, "Subjects")}
        {effectiveYearId && renderQueryFailure(termsQuery, "Terms")}
        {effectiveYearId && renderQueryFailure(classesQuery, "Classes")}
        {classId && renderQueryFailure(streamsQuery, "Streams")}
        {classId && renderQueryFailure(assignmentsQuery, "Class subjects")}
      </div>
    );
  }

  if (!referencesAvailable) {
    return (
      <EmptyState
        className="min-h-32 justify-center"
        description="Scheduling requires an active academic year, term, class-subject assignment, and grading scale. Configure the missing records first."
        title="Assessment options are not configured"
      />
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate ref={formRef}>
      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        The current API does not accept a separate assessment type. Use the assessment name to
        describe the assessment; no type value will be submitted.
      </div>
      {requestError && (
        <div
          className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          <p>
            {requestError instanceof ApiClientError && requestError.status === 403
              ? `The server denied this assessment change. Your current school permissions may not allow it. ${requestError.message}`
              : requestError.message}
          </p>
          {requestError instanceof ApiClientError && requestError.issues.length > 0 && (
            <ul className="list-inside list-disc">
              {requestError.issues.map((issue) => (
                <li key={`${issue.path ?? "request"}-${issue.message}`}>
                  {issue.path ? `${issue.path}: ` : ""}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="assessment-name" label="Assessment name">
          <input
            aria-describedby={fieldErrors.name ? "assessment-name-error" : undefined}
            aria-invalid={Boolean(fieldErrors.name)}
            className={controlClassName}
            id="assessment-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
          <FieldError id="assessment-name-error" message={fieldErrors.name} />
        </FormField>

        <FormField id="assessment-year" label="Academic year">
          <select
            aria-describedby={fieldErrors.academicYearId ? "assessment-year-error" : undefined}
            aria-invalid={Boolean(fieldErrors.academicYearId)}
            className={controlClassName}
            id="assessment-year"
            onChange={(event) => {
              setAcademicYearId(event.target.value);
              setTermId("");
              setClassId("");
              setStreamId("");
              setClassSubjectAssignmentId("");
            }}
            required
            value={effectiveYearId}
          >
            <option value="">Select academic year</option>
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </select>
          <FieldError id="assessment-year-error" message={fieldErrors.academicYearId} />
        </FormField>

        <FormField id="assessment-term" label="Term">
          <select
            aria-describedby={fieldErrors.termId ? "assessment-term-error" : undefined}
            aria-invalid={Boolean(fieldErrors.termId)}
            className={controlClassName}
            disabled={!effectiveYearId}
            id="assessment-term"
            onChange={(event) => setTermId(event.target.value)}
            required
            value={termId}
          >
            <option value="">Select term</option>
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
              </option>
            ))}
          </select>
          <FieldError id="assessment-term-error" message={fieldErrors.termId} />
        </FormField>

        <FormField id="assessment-class" label="Class">
          <select
            aria-describedby={fieldErrors.classId ? "assessment-class-error" : undefined}
            aria-invalid={Boolean(fieldErrors.classId)}
            className={controlClassName}
            disabled={!effectiveYearId}
            id="assessment-class"
            onChange={(event) => {
              setClassId(event.target.value);
              setStreamId("");
              setClassSubjectAssignmentId("");
            }}
            required
            value={classId}
          >
            <option value="">Select class</option>
            {classes.map((academicClass) => (
              <option key={academicClass.id} value={academicClass.id}>
                {academicClass.name}
              </option>
            ))}
          </select>
          <FieldError id="assessment-class-error" message={fieldErrors.classId} />
        </FormField>

        <FormField id="assessment-stream" label="Stream (optional)">
          <select
            className={controlClassName}
            disabled={!classId || streamsQuery.isPending}
            id="assessment-stream"
            onChange={(event) => setStreamId(event.target.value)}
            value={streamId}
          >
            <option value="">All active placements in class</option>
            {streams.map((stream) => (
              <option key={stream.id} value={stream.id}>
                {stream.name}
              </option>
            ))}
          </select>
        </FormField>

        <FormField id="assessment-subject" label="Assigned subject">
          <select
            aria-describedby={
              fieldErrors.classSubjectAssignmentId ? "assessment-subject-error" : undefined
            }
            aria-invalid={Boolean(fieldErrors.classSubjectAssignmentId)}
            className={controlClassName}
            disabled={!classId || assignmentsQuery.isPending}
            id="assessment-subject"
            onChange={(event) => setClassSubjectAssignmentId(event.target.value)}
            required
            value={classSubjectAssignmentId}
          >
            <option value="">
              {classId && assignments.length === 0
                ? "No active subject assignments"
                : "Select assigned subject"}
            </option>
            {assignments.map((assignment) => {
              const subject = subjects.find(({ id }) => id === assignment.subjectId);
              return subject ? (
                <option key={assignment.id} value={assignment.id}>
                  {subject.name}
                </option>
              ) : null;
            })}
          </select>
          <FieldError
            id="assessment-subject-error"
            message={fieldErrors.classSubjectAssignmentId}
          />
        </FormField>

        <FormField id="assessment-grading-scale" label="Grading scale">
          <select
            aria-describedby={fieldErrors.gradingScaleId ? "assessment-scale-error" : undefined}
            aria-invalid={Boolean(fieldErrors.gradingScaleId)}
            className={controlClassName}
            id="assessment-grading-scale"
            onChange={(event) => setGradingScaleId(event.target.value)}
            required
            value={gradingScaleId}
          >
            <option value="">Select grading scale</option>
            {scales.map((scale) => (
              <option key={scale.id} value={scale.id}>
                {scale.name}
              </option>
            ))}
          </select>
          <FieldError id="assessment-scale-error" message={fieldErrors.gradingScaleId} />
        </FormField>

        <FormField id="assessment-maximum-score" label="Maximum score">
          <input
            aria-describedby={fieldErrors.maximumScore ? "assessment-score-error" : undefined}
            aria-invalid={Boolean(fieldErrors.maximumScore)}
            className={controlClassName}
            id="assessment-maximum-score"
            inputMode="decimal"
            onChange={(event) => setMaximumScore(event.target.value)}
            required
            value={maximumScore}
          />
          <FieldError id="assessment-score-error" message={fieldErrors.maximumScore} />
        </FormField>

        <FormField id="assessment-start-date" label="Start date">
          <input
            aria-describedby={fieldErrors.startsOn ? "assessment-start-error" : undefined}
            aria-invalid={Boolean(fieldErrors.startsOn)}
            className={controlClassName}
            id="assessment-start-date"
            max={selectedTerm?.endsOn}
            min={selectedTerm?.startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
            required
            type="date"
            value={startsOn}
          />
          <FieldError id="assessment-start-error" message={fieldErrors.startsOn} />
        </FormField>

        <FormField id="assessment-end-date" label="End date">
          <input
            aria-describedby={fieldErrors.endsOn ? "assessment-end-error" : undefined}
            aria-invalid={Boolean(fieldErrors.endsOn)}
            className={controlClassName}
            id="assessment-end-date"
            max={selectedTerm?.endsOn}
            min={selectedTerm?.startsOn}
            onChange={(event) => setEndsOn(event.target.value)}
            required
            type="date"
            value={endsOn}
          />
          <FieldError id="assessment-end-error" message={fieldErrors.endsOn} />
        </FormField>
      </div>

      <DialogFooter>
        <Button disabled={submitting} type="submit">
          {submitting ? "Saving..." : assessment ? "Save draft changes" : "Schedule assessment"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-destructive" id={id}>
      {message}
    </p>
  );
}
