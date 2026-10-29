import { type FormEvent, useEffect, useState } from "react";
import { RequestError } from "@/components/api/request-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/data-states";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { PlatformSchool, PlatformSchoolStatus } from "@/lib/api/platform-types";

type SchoolUpdate = {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
};

type PlatformSchoolDetailsSheetProps = {
  open: boolean;
  school: PlatformSchool | null;
  isLoading: boolean;
  detailsError: Error | null;
  onRetryDetails(): void;
  isUpdating: boolean;
  isChangingStatus: boolean;
  updateError: Error | null;
  statusError: Error | null;
  onOpenChange(open: boolean): void;
  onUpdate(input: SchoolUpdate): Promise<void>;
  onChangeStatus(status: PlatformSchoolStatus): Promise<void>;
};

const inputClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const transitions: Record<PlatformSchoolStatus, PlatformSchoolStatus[]> = {
  ACTIVE: ["SUSPENDED", "CLOSED"],
  SUSPENDED: ["ACTIVE", "CLOSED"],
  CLOSED: ["ACTIVE"],
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function PlatformSchoolDetailsSheet({
  open,
  school,
  isLoading,
  detailsError,
  onRetryDetails,
  isUpdating,
  isChangingStatus,
  updateError,
  statusError,
  onOpenChange,
  onUpdate,
  onChangeStatus,
}: PlatformSchoolDetailsSheetProps) {
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [nextStatus, setNextStatus] = useState<PlatformSchoolStatus | "">("");
  const [validationError, setValidationError] = useState("");
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [successNotice, setSuccessNotice] = useState("");

  useEffect(() => {
    setName(school?.name ?? "");
    setContactEmail(school?.contactEmail ?? "");
    setContactPhone(school?.contactPhone ?? "");
    setNextStatus("");
    setValidationError("");
    setConfirmingStatus(false);
    setSuccessNotice("");
  }, [school]);

  function resetForm() {
    setName(school?.name ?? "");
    setContactEmail(school?.contactEmail ?? "");
    setContactPhone(school?.contactPhone ?? "");
    setNextStatus("");
    setValidationError("");
    setConfirmingStatus(false);
    setSuccessNotice("");
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!school) return;
    const normalizedName = name.trim();
    const normalizedEmail = contactEmail.trim().toLowerCase();
    const normalizedPhone = contactPhone.trim();
    if (!normalizedName || normalizedName.length > 200) {
      setValidationError("Enter a school name (up to 200 characters).");
      return;
    }
    if (
      normalizedEmail &&
      (normalizedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    ) {
      setValidationError("Enter a valid contact email (up to 320 characters).");
      return;
    }
    if (normalizedPhone && (normalizedPhone.length < 7 || normalizedPhone.length > 40)) {
      setValidationError("Enter a contact phone with 7 to 40 characters.");
      return;
    }
    setValidationError("");
    setSuccessNotice("");
    try {
      await onUpdate({
        name: normalizedName,
        contactEmail: normalizedEmail || null,
        contactPhone: normalizedPhone || null,
      });
      setSuccessNotice("School contact details saved.");
    } catch {
      return;
    }
  }

  async function confirmStatusChange() {
    if (!nextStatus) return;
    try {
      await onChangeStatus(nextStatus);
      setSuccessNotice(`School status updated to ${nextStatus}.`);
      setNextStatus("");
      setConfirmingStatus(false);
    } catch {
      return;
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        aria-describedby="platform-school-details-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        {isLoading && <LoadingState className="min-h-32" message="Loading school details..." />}
        {detailsError && <ErrorState onRetry={onRetryDetails} />}
        {school && (
          <>
            <div className="space-y-2 pr-8">
              <Badge variant="outline">Platform tenant metadata</Badge>
              <SheetTitle className="text-xl">{school.name}</SheetTitle>
              <SheetDescription id="platform-school-details-description">
                Edit contact metadata or update this school&apos;s supported lifecycle status.
                Tenant records cannot be deleted from this platform workflow.
              </SheetDescription>
            </div>

            <dl className="mt-6 divide-y rounded-lg border">
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">School identifier</dt>
                <dd className="break-all font-mono text-xs">{school.id}</dd>
              </div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant="secondary">{school.status}</Badge>
                </dd>
              </div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">Created</dt>
                <dd className="text-sm">{formatDate(school.createdAt)}</dd>
              </div>
            </dl>

            <form
              className="mt-6 space-y-4 border-t pt-5"
              onSubmit={(event) => void handleUpdate(event)}
            >
              <h3 className="text-sm font-semibold">School contact metadata</h3>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">School name</span>
                <input
                  autoComplete="organization"
                  aria-describedby={validationError ? "school-details-validation-error" : undefined}
                  aria-invalid={Boolean(validationError)}
                  className={inputClassName}
                  maxLength={200}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">Contact email</span>
                <input
                  autoComplete="email"
                  aria-describedby={validationError ? "school-details-validation-error" : undefined}
                  aria-invalid={Boolean(validationError)}
                  className={inputClassName}
                  maxLength={320}
                  onChange={(event) => setContactEmail(event.target.value)}
                  type="email"
                  value={contactEmail}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">Contact phone</span>
                <input
                  autoComplete="tel"
                  aria-describedby={validationError ? "school-details-validation-error" : undefined}
                  aria-invalid={Boolean(validationError)}
                  className={inputClassName}
                  maxLength={40}
                  minLength={7}
                  onChange={(event) => setContactPhone(event.target.value)}
                  type="tel"
                  value={contactPhone}
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Leave contact fields empty to clear them. Name is required; phone numbers must have
                7–40 characters.
              </p>
              {validationError && (
                <p
                  className="text-sm text-destructive"
                  id="school-details-validation-error"
                  role="alert"
                >
                  {validationError}
                </p>
              )}
              {successNotice && (
                <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
                  {successNotice}
                </p>
              )}
              <RequestError error={updateError} />
              <div className="flex flex-wrap gap-2">
                <Button disabled={isUpdating} type="submit">
                  {isUpdating ? "Saving changes..." : "Save school details"}
                </Button>
                <Button disabled={isUpdating} onClick={resetForm} type="button" variant="outline">
                  Reset changes
                </Button>
                <Button
                  disabled={isUpdating}
                  onClick={() => {
                    resetForm();
                    onOpenChange(false);
                  }}
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            </form>

            <form
              className="mt-6 space-y-4 border-t pt-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (nextStatus) {
                  setConfirmingStatus(true);
                }
              }}
            >
              <h3 className="text-sm font-semibold">Lifecycle status</h3>
              <p className="text-xs leading-5 text-muted-foreground">
                Status changes are audited. Closing or suspending blocks new school-scoped API
                requests; it does not delete records or memberships.
              </p>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium">New status</span>
                <select
                  className={inputClassName}
                  onChange={(event) => {
                    const value = event.target.value;
                    setNextStatus(
                      transitions[school.status].find((status) => status === value) ?? "",
                    );
                    setConfirmingStatus(false);
                    setSuccessNotice("");
                  }}
                  value={nextStatus}
                >
                  <option value="">Keep {school.status}</option>
                  {transitions[school.status].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <RequestError error={statusError} />
              {confirmingStatus && nextStatus && (
                <fieldset className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                  <legend className="text-sm">
                    Confirm changing this school from {school.status} to {nextStatus}?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={isChangingStatus}
                      onClick={() => void confirmStatusChange()}
                      type="button"
                    >
                      {isChangingStatus ? "Updating status..." : `Confirm ${nextStatus}`}
                    </Button>
                    <Button
                      disabled={isChangingStatus}
                      onClick={() => setConfirmingStatus(false)}
                      type="button"
                      variant="outline"
                    >
                      Cancel status change
                    </Button>
                  </div>
                </fieldset>
              )}
              {!confirmingStatus && (
                <Button disabled={!nextStatus || isChangingStatus} variant="outline" type="submit">
                  Review status change
                </Button>
              )}
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
