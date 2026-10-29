import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/auth-provider";
import { RequestError, RequestLoading } from "@/components/api/request-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UnauthorizedState } from "@/components/ui/data-states";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import { useSchoolData } from "@/lib/api/school-data";

type SchoolProfile = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  updatedAt: string;
};

type ProfileDraft = {
  name: string;
  contactEmail: string;
  contactPhone: string;
};

type ProfileField = keyof ProfileDraft;
type ValidationErrors = Partial<Record<ProfileField, string>>;

const emptyDraft: ProfileDraft = {
  name: "",
  contactEmail: "",
  contactPhone: "",
};

function toDraft(profile: SchoolProfile): ProfileDraft {
  return {
    name: profile.name,
    contactEmail: profile.contactEmail ?? "",
    contactPhone: profile.contactPhone ?? "",
  };
}

function draftsMatch(left: ProfileDraft, right: ProfileDraft | null) {
  return (
    right !== null &&
    left.name === right.name &&
    left.contactEmail === right.contactEmail &&
    left.contactPhone === right.contactPhone
  );
}

export function SettingsPage() {
  const { school, updateSchoolName } = useAuth();
  const queryClient = useQueryClient();
  const canReadProfile = school?.permissions.includes("school.profile.read") ?? false;
  const canUpdateProfile = school?.permissions.includes("school.profile.update") ?? false;
  const schoolId = school?.id;
  const profile = useSchoolData<{ data: SchoolProfile }>("", {}, { enabled: canReadProfile });
  const [initialValues, setInitialValues] = useState<ProfileDraft | null>(null);
  const [values, setValues] = useState<ProfileDraft>(emptyDraft);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [saved, setSaved] = useState(false);
  const savingRef = useRef(false);
  const initializedSchoolId = useRef<string | null>(null);
  const initialValuesRef = useRef<ProfileDraft | null>(null);
  const valuesRef = useRef<ProfileDraft>(emptyDraft);

  useEffect(() => {
    const record = profile.data?.data;
    if (!record || !schoolId) return;

    const next = toDraft(record);
    if (initializedSchoolId.current !== schoolId) {
      initializedSchoolId.current = schoolId;
      initialValuesRef.current = next;
      valuesRef.current = next;
      setInitialValues(next);
      setValues(next);
      setValidationErrors({});
      setSaveError(null);
      setSaved(false);
      return;
    }

    if (draftsMatch(valuesRef.current, initialValuesRef.current)) {
      initialValuesRef.current = next;
      valuesRef.current = next;
      setInitialValues(next);
      setValues(next);
    }
  }, [profile.data?.data, schoolId]);

  function updateDraft(next: ProfileDraft) {
    valuesRef.current = next;
    setValues(next);
  }

  function updateField(field: ProfileField, value: string) {
    updateDraft({ ...valuesRef.current, [field]: value });
    setValidationErrors((current) => ({ ...current, [field]: undefined }));
    setSaveError(null);
    setSaved(false);
  }

  function handleFieldChange(field: ProfileField) {
    return (event: ChangeEvent<HTMLInputElement>) => updateField(field, event.target.value);
  }

  function validate(form: HTMLFormElement): ValidationErrors {
    const errors: ValidationErrors = {};
    const normalizedName = values.name.trim();
    const normalizedEmail = values.contactEmail.trim();
    const normalizedPhone = values.contactPhone.trim();
    const emailInput = form.elements.namedItem("contactEmail");

    if (!normalizedName) {
      errors.name = "Enter a school name.";
    } else if (normalizedName.length > 200) {
      errors.name = "School name must be 200 characters or fewer.";
    }

    if (
      normalizedEmail &&
      emailInput instanceof HTMLInputElement &&
      emailInput.validity.typeMismatch
    ) {
      errors.contactEmail = "Enter a valid email address.";
    } else if (normalizedEmail.length > 320) {
      errors.contactEmail = "Contact email must be 320 characters or fewer.";
    }

    if (normalizedPhone && normalizedPhone.length < 7) {
      errors.contactPhone = "Contact phone must be at least 7 characters.";
    } else if (normalizedPhone.length > 40) {
      errors.contactPhone = "Contact phone must be 40 characters or fewer.";
    }

    return errors;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!school || !canUpdateProfile || savingRef.current || !initialValues) return;
    if (draftsMatch(valuesRef.current, initialValuesRef.current)) return;

    const errors = validate(event.currentTarget);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const result = await apiRequest<{ data: SchoolProfile }>(
        `/schools/${encodeURIComponent(school.id)}`,
        {
          method: "PATCH",
          body: {
            name: valuesRef.current.name.trim(),
            contactEmail: valuesRef.current.contactEmail.trim() || null,
            contactPhone: valuesRef.current.contactPhone.trim() || null,
          },
        },
      );
      const next = toDraft(result.data);
      initialValuesRef.current = next;
      valuesRef.current = next;
      setInitialValues(next);
      setValues(next);
      queryClient.setQueryData(["school-data", school.id, "", ""], result);
      updateSchoolName(school.id, result.data.name);
      setSaved(true);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error
          : new ApiClientError("School profile could not be saved.", 0, "REQUEST_FAILED"),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function cancelChanges() {
    if (!initialValues || savingRef.current) return;
    updateDraft(initialValues);
    setValidationErrors({});
    setSaveError(null);
    setSaved(false);
  }

  const isDirty = initialValues !== null && !draftsMatch(values, initialValues);

  return (
    <div className="space-y-6">
      <PageHeader
        description="Manage the school name and contact details available in your workspace."
        eyebrow={<p className="text-sm font-medium text-primary">Workspace controls</p>}
        title="School settings"
      />
      {!canReadProfile ? (
        <Card className="max-w-2xl shadow-none">
          <CardContent className="p-4 sm:p-6">
            <UnauthorizedState
              description="Your school access does not include permission to view the school profile."
              title="School profile unavailable"
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-2xl shadow-none">
          <CardContent className="p-4 sm:p-6">
            {profile.isError ? (
              <div className="space-y-3">
                <RequestError error={profile.error} />
                <Button onClick={() => void profile.refetch()} type="button" variant="outline">
                  Try again
                </Button>
              </div>
            ) : profile.isPending || !initialValues ? (
              <RequestLoading />
            ) : (
              <form
                aria-busy={saving}
                className="space-y-6"
                noValidate
                onSubmit={(event) => void save(event)}
              >
                <section aria-labelledby="school-profile-heading" className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold" id="school-profile-heading">
                      School profile
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      The name used to identify this school workspace.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="school-name">
                      School name
                    </label>
                    <input
                      aria-describedby={validationErrors.name ? "school-name-error" : undefined}
                      aria-invalid={Boolean(validationErrors.name)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={saving}
                      id="school-name"
                      maxLength={200}
                      onChange={handleFieldChange("name")}
                      readOnly={!canUpdateProfile}
                      required
                      value={values.name}
                    />
                    {validationErrors.name && (
                      <p className="text-sm text-destructive" id="school-name-error" role="alert">
                        {validationErrors.name}
                      </p>
                    )}
                  </div>
                </section>

                <section
                  aria-labelledby="school-contact-heading"
                  className="space-y-4 border-t pt-5"
                >
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold" id="school-contact-heading">
                      Contact details
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      These fields are optional. Leave them blank to clear existing contact details.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="school-contact-email">
                      Contact email
                    </label>
                    <input
                      aria-describedby={
                        validationErrors.contactEmail ? "school-contact-email-error" : undefined
                      }
                      aria-invalid={Boolean(validationErrors.contactEmail)}
                      autoComplete="email"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={saving}
                      id="school-contact-email"
                      maxLength={320}
                      name="contactEmail"
                      onChange={handleFieldChange("contactEmail")}
                      readOnly={!canUpdateProfile}
                      type="email"
                      value={values.contactEmail}
                    />
                    {validationErrors.contactEmail && (
                      <p
                        className="text-sm text-destructive"
                        id="school-contact-email-error"
                        role="alert"
                      >
                        {validationErrors.contactEmail}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium" htmlFor="school-contact-phone">
                      Contact phone
                    </label>
                    <input
                      aria-describedby={
                        validationErrors.contactPhone ? "school-contact-phone-error" : undefined
                      }
                      aria-invalid={Boolean(validationErrors.contactPhone)}
                      autoComplete="tel"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      disabled={saving}
                      id="school-contact-phone"
                      maxLength={40}
                      onChange={handleFieldChange("contactPhone")}
                      readOnly={!canUpdateProfile}
                      type="tel"
                      value={values.contactPhone}
                    />
                    {validationErrors.contactPhone && (
                      <p
                        className="text-sm text-destructive"
                        id="school-contact-phone-error"
                        role="alert"
                      >
                        {validationErrors.contactPhone}
                      </p>
                    )}
                  </div>
                </section>

                {!canUpdateProfile ? (
                  <p className="border-t pt-4 text-sm text-muted-foreground" role="status">
                    You have view-only access to the school profile.
                  </p>
                ) : (
                  <div className="space-y-3 border-t pt-4">
                    {isDirty && (
                      <p className="text-sm text-muted-foreground" role="status">
                        You have unsaved changes.
                      </p>
                    )}
                    {saveError && <RequestError error={saveError} />}
                    {saved && (
                      <p className="text-sm text-green-700" role="status">
                        School profile saved.
                      </p>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                      {isDirty && (
                        <Button
                          disabled={saving}
                          onClick={cancelChanges}
                          type="button"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      )}
                      <Button disabled={saving || !isDirty} type="submit">
                        {saving ? "Saving..." : "Save profile"}
                      </Button>
                    </div>
                  </div>
                )}
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
