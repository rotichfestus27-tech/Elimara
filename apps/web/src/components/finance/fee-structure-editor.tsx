import { useQueryClient } from "@tanstack/react-query";
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
import { useSchoolList } from "@/lib/api/school-data";

type AcademicYear = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

type AcademicTerm = {
  id: string;
  academicYearId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

type AcademicClass = {
  id: string;
  academicYearId: string;
  name: string;
};

type FeeItemInput = {
  key: number;
  name: string;
  amount: string;
};

type FeeStructureInput = {
  academicYearId: string;
  termId: string;
  classId: string;
  name: string;
  items: Array<{ name: string; amount: string }>;
};

const controlClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function FeeStructureEditor({ onSaved }: { onSaved: () => void }) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [academicYearSelection, setAcademicYearSelection] = useState<string | null>(null);
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [items, setItems] = useState<FeeItemInput[]>([{ key: 0, name: "", amount: "" }]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState<ApiClientError | Error | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const itemKeyRef = useRef(1);
  const formRef = useRef<HTMLFormElement>(null);
  const canManage = Boolean(school?.permissions.includes("finance.fees.manage"));
  const canReadConfiguration = Boolean(
    school?.permissions.includes("academics.configuration.read"),
  );
  const yearsQuery = useSchoolList<AcademicYear>(
    "/academic-years",
    { limit: 100, offset: 0, status: "ACTIVE" },
    { enabled: open && canReadConfiguration },
  );
  const effectiveYearId = academicYearSelection ?? yearsQuery.data?.data[0]?.id ?? "";
  const termsQuery = useSchoolList<AcademicTerm>(
    "/terms",
    { academicYearId: effectiveYearId, limit: 100, offset: 0, status: "ACTIVE" },
    { enabled: open && canReadConfiguration && Boolean(effectiveYearId) },
  );
  const classesQuery = useSchoolList<AcademicClass>(
    "/classes",
    { academicYearId: effectiveYearId, limit: 100, offset: 0, status: "ACTIVE" },
    { enabled: open && canReadConfiguration && Boolean(effectiveYearId) },
  );

  useEffect(() => {
    if (Object.keys(fieldErrors).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [fieldErrors]);

  function validate(): FeeStructureInput | null {
    const errors: Record<string, string> = {};
    if (!effectiveYearId) errors.academicYearId = "Select an active academic year.";
    if (!termId) errors.termId = "Select an active term.";
    if (!classId) errors.classId = "Select an active class.";
    if (!name.trim()) errors.name = "Enter a fee structure name.";
    else if (name.trim().length > 120)
      errors.name = "Fee structure name must be 120 characters or fewer.";
    if (items.length === 0 || items.length > 100) {
      errors.items = "A fee structure must contain between 1 and 100 items.";
    }
    for (const item of items) {
      if (!item.name.trim()) errors[`item-name-${item.key}`] = "Enter an item name.";
      else if (item.name.trim().length > 120) {
        errors[`item-name-${item.key}`] = "Item names must be 120 characters or fewer.";
      }
      if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(item.amount) || !/[1-9]/.test(item.amount)) {
        errors[`item-amount-${item.key}`] =
          "Enter a positive amount with up to two decimal places.";
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return null;

    return {
      academicYearId: effectiveYearId,
      termId,
      classId,
      name: name.trim(),
      items: items.map(({ name: itemName, amount }) => ({
        name: itemName.trim(),
        amount,
      })),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || !school || !canManage || !canReadConfiguration) return;
    setRequestError(null);
    const body = validate();
    if (!body) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await apiRequest<{ data: unknown }>(
        `/schools/${encodeURIComponent(school.id)}/finance/fee-structures`,
        { method: "POST", body },
      );
      await queryClient.invalidateQueries({ queryKey: ["school-data", school.id] });
      setOpen(false);
      setAcademicYearSelection(null);
      setTermId("");
      setClassId("");
      setName("");
      setItems([{ key: itemKeyRef.current++, name: "", amount: "" }]);
      setFieldErrors({});
      onSaved();
    } catch (error) {
      setRequestError(
        error instanceof Error ? error : new Error("The fee structure could not be created."),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const referenceFailure = [yearsQuery, termsQuery, classesQuery].find((query) => query.isError);
  const deniedReference = isPermissionDenied(referenceFailure?.error ?? null);
  const referencesPending =
    yearsQuery.isPending ||
    (Boolean(effectiveYearId) && (termsQuery.isPending || classesQuery.isPending));

  if (!canManage) return null;

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!submitting) setOpen(nextOpen);
      }}
      open={open}
    >
      <Button onClick={() => setOpen(true)} type="button">
        Create fee structure
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create fee structure</DialogTitle>
          <DialogDescription>
            Define a school, academic-year, term, and class-specific structure with its fee items.
            Creating a structure does not post a charge to student accounts.
          </DialogDescription>
        </DialogHeader>

        {!canReadConfiguration ? (
          <UnauthorizedState
            description="Creating a fee structure requires academic configuration read access to select an active year, term, and class."
            title="Academic options access unavailable"
          />
        ) : yearsQuery.isPending ? (
          <LoadingState className="min-h-32" message="Loading academic options..." />
        ) : deniedReference ? (
          <UnauthorizedState
            description="The server denied access to academic years, terms, or classes for this school."
            title="Academic options access denied"
          />
        ) : referenceFailure ? (
          <ErrorState
            message="Academic options could not be loaded."
            onRetry={() => void referenceFailure.refetch()}
          />
        ) : referencesPending ? (
          <LoadingState className="min-h-32" message="Loading terms and classes..." />
        ) : yearsQuery.data?.data.length === 0 ? (
          <EmptyState
            className="min-h-28 justify-center"
            description="Add an active academic year before creating a fee structure."
            title="No active academic years"
          />
        ) : termsQuery.data?.data.length === 0 || classesQuery.data?.data.length === 0 ? (
          <EmptyState
            className="min-h-28 justify-center"
            description="The selected academic year needs at least one active term and class."
            title="Academic options are incomplete"
          />
        ) : (
          <form className="space-y-5" noValidate onSubmit={handleSubmit} ref={formRef}>
            {requestError && (
              <div
                className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                role="alert"
              >
                <p>
                  {requestError instanceof ApiClientError && requestError.status === 403
                    ? `The server denied fee-structure creation. ${requestError.message}`
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
              <FormField id="fee-structure-name" label="Fee structure name">
                <input
                  aria-describedby={fieldErrors.name ? "fee-structure-name-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.name)}
                  className={controlClassName}
                  id="fee-structure-name"
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
                <FieldError id="fee-structure-name-error" message={fieldErrors.name} />
              </FormField>
              <FormField id="fee-structure-year" label="Academic year">
                <select
                  aria-describedby={
                    fieldErrors.academicYearId ? "fee-structure-year-error" : undefined
                  }
                  aria-invalid={Boolean(fieldErrors.academicYearId)}
                  className={controlClassName}
                  id="fee-structure-year"
                  onChange={(event) => {
                    setAcademicYearSelection(event.target.value);
                    setTermId("");
                    setClassId("");
                  }}
                  required
                  value={effectiveYearId}
                >
                  <option value="">Select academic year</option>
                  {yearsQuery.data?.data.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </select>
                <FieldError id="fee-structure-year-error" message={fieldErrors.academicYearId} />
              </FormField>
              <FormField id="fee-structure-term" label="Term">
                <select
                  aria-describedby={fieldErrors.termId ? "fee-structure-term-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.termId)}
                  className={controlClassName}
                  disabled={!effectiveYearId || termsQuery.isPending}
                  id="fee-structure-term"
                  onChange={(event) => setTermId(event.target.value)}
                  required
                  value={termId}
                >
                  <option value="">Select term</option>
                  {termsQuery.data?.data.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                    </option>
                  ))}
                </select>
                <FieldError id="fee-structure-term-error" message={fieldErrors.termId} />
              </FormField>
              <FormField id="fee-structure-class" label="Class">
                <select
                  aria-describedby={fieldErrors.classId ? "fee-structure-class-error" : undefined}
                  aria-invalid={Boolean(fieldErrors.classId)}
                  className={controlClassName}
                  disabled={!effectiveYearId || classesQuery.isPending}
                  id="fee-structure-class"
                  onChange={(event) => setClassId(event.target.value)}
                  required
                  value={classId}
                >
                  <option value="">Select class</option>
                  {classesQuery.data?.data.map((academicClass) => (
                    <option key={academicClass.id} value={academicClass.id}>
                      {academicClass.name}
                    </option>
                  ))}
                </select>
                <FieldError id="fee-structure-class-error" message={fieldErrors.classId} />
              </FormField>
            </div>

            <section aria-labelledby="fee-structure-items-heading" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold" id="fee-structure-items-heading">
                    Fee items
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Enter only categories and amounts defined by your school.
                  </p>
                </div>
                <Button
                  disabled={items.length >= 100}
                  onClick={() => {
                    setItems((current) => [
                      ...current,
                      { key: itemKeyRef.current++, name: "", amount: "" },
                    ]);
                  }}
                  type="button"
                  variant="outline"
                >
                  Add item
                </Button>
              </div>
              {fieldErrors.items && <p className="text-xs text-destructive">{fieldErrors.items}</p>}
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    className="grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
                    key={item.key}
                  >
                    <FormField id={`fee-item-name-${item.key}`} label={`Item ${index + 1} name`}>
                      <input
                        aria-describedby={
                          fieldErrors[`item-name-${item.key}`]
                            ? `fee-item-name-error-${item.key}`
                            : undefined
                        }
                        aria-invalid={Boolean(fieldErrors[`item-name-${item.key}`])}
                        className={controlClassName}
                        id={`fee-item-name-${item.key}`}
                        maxLength={120}
                        onChange={(event) => {
                          const value = event.target.value;
                          setItems((current) =>
                            current.map((entry) =>
                              entry.key === item.key ? { ...entry, name: value } : entry,
                            ),
                          );
                        }}
                        required
                        value={item.name}
                      />
                      <FieldError
                        id={`fee-item-name-error-${item.key}`}
                        message={fieldErrors[`item-name-${item.key}`]}
                      />
                    </FormField>
                    <FormField id={`fee-item-amount-${item.key}`} label="Amount (KES)">
                      <input
                        aria-describedby={
                          fieldErrors[`item-amount-${item.key}`]
                            ? `fee-item-amount-error-${item.key}`
                            : undefined
                        }
                        aria-invalid={Boolean(fieldErrors[`item-amount-${item.key}`])}
                        className={controlClassName}
                        id={`fee-item-amount-${item.key}`}
                        inputMode="decimal"
                        onChange={(event) => {
                          const value = event.target.value;
                          setItems((current) =>
                            current.map((entry) =>
                              entry.key === item.key ? { ...entry, amount: value } : entry,
                            ),
                          );
                        }}
                        required
                        value={item.amount}
                      />
                      <FieldError
                        id={`fee-item-amount-error-${item.key}`}
                        message={fieldErrors[`item-amount-${item.key}`]}
                      />
                    </FormField>
                    <Button
                      aria-label={`Remove item ${index + 1}`}
                      disabled={items.length === 1}
                      onClick={() =>
                        setItems((current) => current.filter((entry) => entry.key !== item.key))
                      }
                      type="button"
                      variant="outline"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </section>

            <DialogFooter>
              <Button disabled={submitting} type="submit">
                {submitting ? "Creating..." : "Create fee structure"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
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

function isPermissionDenied(error: Error | null): boolean {
  return error instanceof ApiClientError && error.status === 403;
}
