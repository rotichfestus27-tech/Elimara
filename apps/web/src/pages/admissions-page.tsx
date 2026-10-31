import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  Plus,
  Search,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/app/auth-provider";
import { RequestError, RequestLoading } from "@/components/api/request-state";
import {
  ApplicationStatusBadge,
  type ApplicationStatus,
} from "@/components/admissions/application-status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UnauthorizedState } from "@/components/ui/data-states";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiRequest } from "@/lib/api/client";
import { useSchoolList } from "@/lib/api/school-data";

export type AdmissionStatus = ApplicationStatus;

export type ApplicationGuardian = {
  id?: string;
  guardianId?: string | null;
  existingGuardianId?: string;
  givenName: string;
  middleName?: string | null;
  familyName: string;
  email?: string | null;
  phone?: string | null;
  relationship: string;
  authorizedAccess: boolean;
};

export type AdmissionApplication = {
  id: string;
  status: AdmissionStatus;
  possibleDuplicate: boolean;
  givenName: string;
  middleName: string | null;
  familyName: string;
  dateOfBirth: string | null;
  guardians: ApplicationGuardian[];
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  withdrawnAt: string | null;
  admittedAt: string | null;
  studentId: string | null;
};

type AcademicYear = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: "ACTIVE" | "INACTIVE";
};

type ClassRecord = {
  id: string;
  name: string;
  academicYearId: string;
  status: "ACTIVE" | "INACTIVE";
};

type StreamRecord = {
  id: string;
  name: string;
  classId: string;
  status: "ACTIVE" | "INACTIVE";
};

type GuardianDirectoryRecord = {
  id: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  email: string | null;
  phone: string | null;
};

export function AdmissionsPage() {
  const { school } = useAuth();
  const canReadApplications = Boolean(school?.permissions.includes("admissions.application.read"));
  const canCreateApplications = Boolean(
    school?.permissions.includes("admissions.application.create"),
  );
  const canAdmitApplications = Boolean(
    school?.permissions.includes("admissions.application.admit"),
  );
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Selected application for detail drawer
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  // Modal / Sheet visibility states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAdmitOpen, setIsAdmitOpen] = useState(false);

  // Queries
  const applications = useSchoolList<AdmissionApplication>(
    "/admission-applications",
    {
      limit: pageSize,
      offset,
      q: searchTerm.trim() || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      sortBy: "createdAt",
      sortOrder: "desc",
    },
    { enabled: canReadApplications },
  );

  const selectedApplication = applications.data?.data.find(
    (app) => app.id === selectedApplicationId,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          canCreateApplications ? (
            <Button className="shrink-0 gap-2" onClick={() => setIsCreateOpen(true)}>
              <Plus className="size-4" />
              New Application
            </Button>
          ) : undefined
        }
        description="Review, process, and admit learner applications recorded for your school."
        eyebrow={<p className="text-sm font-medium text-primary">Enrolment</p>}
        title="Admissions"
      />

      {!canReadApplications ? (
        <Card className="shadow-none">
          <CardContent className="p-6">
            <UnauthorizedState
              description="Your school access does not include permission to view admission applications."
              title="Admissions access denied"
            />
          </CardContent>
        </Card>
      ) : (
        <section aria-labelledby="applications-heading" className="space-y-4">
          <div>
            <h3 id="applications-heading" className="text-base font-semibold">
              Applications
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Search by applicant name and filter by status. Click an application to inspect or
              transition.
            </p>
          </div>

          <Card className="shadow-none">
            <CardContent className="space-y-5 p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_190px]">
                <label className="relative block">
                  <span className="sr-only">Search applicants</span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => {
                      setSearchTerm(event.target.value);
                      setOffset(0);
                      setPageSize(25);
                    }}
                    placeholder="Search applicants"
                    type="search"
                    value={searchTerm}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    Application status
                  </span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => {
                      setStatusFilter(event.target.value);
                      setOffset(0);
                      setPageSize(25);
                    }}
                    value={statusFilter}
                  >
                    <option value="all">All statuses</option>
                    <option value="DRAFT">Draft</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="UNDER_REVIEW">Under review</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="WITHDRAWN">Withdrawn</option>
                    <option value="ADMITTED">Admitted</option>
                  </select>
                </label>
              </div>

              <div aria-live="polite" className="overflow-hidden rounded-lg border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <caption className="sr-only">Admissions applications</caption>
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Applicant
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Date of Birth
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Guardians
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Created
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right font-medium" scope="col">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.isPending ? (
                        <tr>
                          <td colSpan={6}>
                            <RequestLoading />
                          </td>
                        </tr>
                      ) : applications.isError ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="space-y-3 p-4">
                              <RequestError error={applications.error} />
                              <Button
                                disabled={applications.isFetching}
                                onClick={() => void applications.refetch()}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Retry loading applications
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : applications.data.data.length === 0 ? (
                        <tr>
                          <td
                            className="px-4 py-12 text-center text-sm text-muted-foreground"
                            colSpan={6}
                          >
                            No applications found matching your criteria.
                          </td>
                        </tr>
                      ) : (
                        applications.data.data.map((application) => {
                          const fullName = [
                            application.givenName,
                            application.middleName,
                            application.familyName,
                          ]
                            .filter(Boolean)
                            .join(" ");

                          return (
                            <tr
                              className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                              key={application.id}
                              onClick={() => setSelectedApplicationId(application.id)}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground">{fullName}</span>
                                  {application.possibleDuplicate && (
                                    <span
                                      className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                                      title="Possible duplicate application or learner record detected"
                                    >
                                      Duplicate
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {application.dateOfBirth ? application.dateOfBirth : "—"}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {application.guardians.length > 0
                                  ? application.guardians
                                      .map(
                                        (g) =>
                                          `${[g.givenName, g.familyName].filter(Boolean).join(" ")} (${g.relationship})`,
                                      )
                                      .join(", ")
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {new Date(application.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3">
                                <ApplicationStatusBadge status={application.status} />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  aria-label={`View details for ${fullName}`}
                                  aria-pressed={selectedApplicationId === application.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedApplicationId(application.id);
                                  }}
                                  size="sm"
                                  variant="ghost"
                                >
                                  View
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {!applications.isError && !applications.isPending && applications.data && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p aria-live="polite" className="text-xs text-muted-foreground">
                    {applications.data.meta.total === 0
                      ? "No applications to display."
                      : `Showing ${applications.data.meta.offset + 1}–${applications.data.meta.offset + applications.data.data.length} of ${applications.data.meta.total} applications.`}
                  </p>
                  {applications.data.meta.total > applications.data.meta.limit && (
                    <nav aria-label="Application pages" className="flex items-center gap-2">
                      <Button
                        disabled={applications.data.meta.offset === 0 || applications.isFetching}
                        onClick={() => {
                          setPageSize(applications.data.meta.limit);
                          setOffset(
                            Math.max(
                              0,
                              applications.data.meta.offset - applications.data.meta.limit,
                            ),
                          );
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Page{" "}
                        {Math.floor(
                          applications.data.meta.offset / applications.data.meta.limit,
                        ) + 1}{" "}
                        of{" "}
                        {Math.ceil(applications.data.meta.total / applications.data.meta.limit)}
                      </span>
                      <Button
                        disabled={
                          applications.data.meta.offset + applications.data.data.length >=
                            applications.data.meta.total ||
                          applications.isFetching
                        }
                        onClick={() => {
                          setPageSize(applications.data.meta.limit);
                          setOffset(applications.data.meta.offset + applications.data.meta.limit);
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Next
                      </Button>
                    </nav>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* New Application Sheet */}
      {canCreateApplications && (
        <CreateApplicationSheet
          onClose={() => setIsCreateOpen(false)}
          onCreated={(id) => {
            setIsCreateOpen(false);
            setSelectedApplicationId(id);
          }}
          open={isCreateOpen}
        />
      )}

      {/* Application Details Sheet */}
      {canReadApplications && selectedApplication && (
        <ApplicationDetailSheet
          application={selectedApplication}
          onAdmitClick={() => setIsAdmitOpen(true)}
          onClose={() => setSelectedApplicationId(null)}
          onEditClick={() => setIsEditOpen(true)}
          open={Boolean(selectedApplicationId && !isAdmitOpen && !isEditOpen)}
        />
      )}

      {/* Edit Draft Application Sheet */}
      {canCreateApplications && selectedApplication && (
        <EditDraftApplicationSheet
          application={selectedApplication}
          onClose={() => setIsEditOpen(false)}
          onUpdated={() => setIsEditOpen(false)}
          open={isEditOpen}
        />
      )}

      {/* Admit Student Modal */}
      {canAdmitApplications && selectedApplication && (
        <AdmitStudentDialog
          application={selectedApplication}
          onAdmitted={() => {
            setIsAdmitOpen(false);
            setSelectedApplicationId(null);
          }}
          onClose={() => setIsAdmitOpen(false)}
          open={isAdmitOpen}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Component: CreateApplicationSheet
// -----------------------------------------------------------------------------

function CreateApplicationSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { school } = useAuth();
  const canReadGuardians = school?.permissions.includes("guardians.profile.read") ?? false;
  const queryClient = useQueryClient();
  const fieldId = useId();

  const [givenName, setGivenName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  // Guardian Mode: 'new' or 'existing'
  const [guardianMode, setGuardianMode] = useState<"new" | "existing">("new");
  const activeGuardianMode = canReadGuardians ? guardianMode : "new";
  const [existingGuardianId, setExistingGuardianId] = useState("");
  const [guardianGivenName, setGuardianGivenName] = useState("");
  const [guardianMiddleName, setGuardianMiddleName] = useState("");
  const [guardianFamilyName, setGuardianFamilyName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [relationship, setRelationship] = useState("Parent");
  const [authorizedAccess, setAuthorizedAccess] = useState(true);

  const [formError, setFormError] = useState<string | null>(null);

  // Load existing school guardians for selection
  const guardiansQuery = useSchoolList<GuardianDirectoryRecord>(
    "/guardians",
    { limit: 100 },
    { enabled: open && canReadGuardians },
  );

  const resetForm = () => {
    setGivenName("");
    setMiddleName("");
    setFamilyName("");
    setDateOfBirth("");
    setGuardianMode("new");
    setExistingGuardianId("");
    setGuardianGivenName("");
    setGuardianMiddleName("");
    setGuardianFamilyName("");
    setGuardianEmail("");
    setGuardianPhone("");
    setRelationship("Parent");
    setAuthorizedAccess(true);
    setFormError(null);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");

      const guardianPayload: ApplicationGuardian =
        activeGuardianMode === "existing"
          ? {
              existingGuardianId,
              givenName: "",
              familyName: "",
              relationship: relationship.trim(),
              authorizedAccess,
            }
          : {
              givenName: guardianGivenName.trim(),
              middleName: guardianMiddleName.trim() || null,
              familyName: guardianFamilyName.trim(),
              email: guardianEmail.trim() || null,
              phone: guardianPhone.trim() || null,
              relationship: relationship.trim(),
              authorizedAccess,
            };

      const payload = {
        givenName: givenName.trim(),
        middleName: middleName.trim() || null,
        familyName: familyName.trim(),
        dateOfBirth: dateOfBirth || null,
        guardians: [guardianPayload],
      };

      const res = await apiRequest<{ data: AdmissionApplication }>(
        `/schools/${school.id}/admission-applications`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: payload,
        },
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/admission-applications"],
      });
      resetForm();
      onCreated(data.id);
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to create application.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!givenName.trim() || !familyName.trim()) {
      setFormError("Applicant given name and family name are required.");
      return;
    }

    if (activeGuardianMode === "existing") {
      if (!existingGuardianId) {
        setFormError("Please select an existing guardian from the directory.");
        return;
      }
    } else {
      if (!guardianGivenName.trim() || !guardianFamilyName.trim()) {
        setFormError("Guardian given name and family name are required.");
        return;
      }
      if (!guardianEmail.trim() && !guardianPhone.trim()) {
        setFormError("At least one contact method (email or phone) is required for the guardian.");
        return;
      }
    }

    if (!relationship.trim()) {
      setFormError("Relationship to applicant is required.");
      return;
    }

    createMutation.mutate();
  };

  return (
    <Sheet
      onOpenChange={(next) => {
        if (!next) {
          resetForm();
          onClose();
        }
      }}
      open={open}
    >
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <SheetHeader>
            <SheetTitle>New Admission Application</SheetTitle>
            <SheetDescription>
              {canReadGuardians
                ? "Create an initial application draft. You can specify a new guardian or link an existing guardian from the directory."
                : "Create an initial application draft and enter the primary guardian's details."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 py-6">
            {formError && (
              <div
                aria-live="assertive"
                className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2"
                role="alert"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Applicant Details */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <GraduationCap className="size-4 text-primary" />
                Applicant Details
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor={`${fieldId}-applicant-given`}
                  >
                    Given name <span className="text-destructive">*</span>
                  </label>
                  <input
                    id={`${fieldId}-applicant-given`}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(e) => setGivenName(e.target.value)}
                    placeholder="e.g. Amina"
                    required
                    value={givenName}
                  />
                </div>
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor={`${fieldId}-applicant-middle`}
                  >
                    Middle name
                  </label>
                  <input
                    id={`${fieldId}-applicant-middle`}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(e) => setMiddleName(e.target.value)}
                    placeholder="Optional"
                    value={middleName}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor={`${fieldId}-applicant-family`}
                  >
                    Family name <span className="text-destructive">*</span>
                  </label>
                  <input
                    id={`${fieldId}-applicant-family`}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(e) => setFamilyName(e.target.value)}
                    placeholder="e.g. Otieno"
                    required
                    value={familyName}
                  />
                </div>
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor={`${fieldId}-applicant-dob`}
                  >
                    Date of birth
                  </label>
                  <input
                    id={`${fieldId}-applicant-dob`}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    type="date"
                    value={dateOfBirth}
                  />
                </div>
              </div>
            </div>

            <hr className="border-border" />

            {/* Guardian Information */}
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  Primary Guardian
                </h4>
                {canReadGuardians ? (
                  <div className="flex rounded-md border bg-muted p-0.5 text-xs">
                    <button
                      className={`rounded px-2.5 py-1 font-medium transition-colors ${
                        activeGuardianMode === "new"
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => setGuardianMode("new")}
                      type="button"
                    >
                      New Guardian
                    </button>
                    <button
                      className={`rounded px-2.5 py-1 font-medium transition-colors ${
                        activeGuardianMode === "existing"
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground"
                      }`}
                      onClick={() => setGuardianMode("existing")}
                      type="button"
                    >
                      Existing Guardian
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Existing guardian selection requires guardian-profile read permission.
                  </p>
                )}
              </div>

              {activeGuardianMode === "existing" ? (
                <div className="space-y-3">
                  <label className="space-y-1.5 block">
                    <span className="text-xs font-medium text-muted-foreground">
                      Select Guardian from Directory <span className="text-destructive">*</span>
                    </span>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(e) => setExistingGuardianId(e.target.value)}
                      value={existingGuardianId}
                    >
                      <option value="">Choose a guardian...</option>
                      {guardiansQuery.data?.data.map((g) => (
                        <option key={g.id} value={g.id}>
                          {[g.givenName, g.familyName].join(" ")} (
                          {g.phone || g.email || "No contact"})
                        </option>
                      ))}
                    </select>
                  </label>
                  {guardiansQuery.data?.data.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No existing guardians found. Switch to "New Guardian" to create one.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 col-span-2 sm:col-span-1">
                      <label
                        className="text-xs font-medium text-muted-foreground"
                        htmlFor={`${fieldId}-guardian-given`}
                      >
                        Given name <span className="text-destructive">*</span>
                      </label>
                      <input
                        id={`${fieldId}-guardian-given`}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                        onChange={(e) => setGuardianGivenName(e.target.value)}
                        placeholder="e.g. Grace"
                        value={guardianGivenName}
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2 sm:col-span-1">
                      <label
                        className="text-xs font-medium text-muted-foreground"
                        htmlFor={`${fieldId}-guardian-middle`}
                      >
                        Middle name
                      </label>
                      <input
                        id={`${fieldId}-guardian-middle`}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                        onChange={(e) => setGuardianMiddleName(e.target.value)}
                        placeholder="Optional"
                        value={guardianMiddleName}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium text-muted-foreground"
                      htmlFor={`${fieldId}-guardian-family`}
                    >
                      Family name <span className="text-destructive">*</span>
                    </label>
                    <input
                      id={`${fieldId}-guardian-family`}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(e) => setGuardianFamilyName(e.target.value)}
                      placeholder="e.g. Otieno"
                      value={guardianFamilyName}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5 col-span-2 sm:col-span-1">
                      <label
                        className="text-xs font-medium text-muted-foreground"
                        htmlFor={`${fieldId}-guardian-phone`}
                      >
                        Phone number
                      </label>
                      <input
                        id={`${fieldId}-guardian-phone`}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                        onChange={(e) => setGuardianPhone(e.target.value)}
                        placeholder="e.g. +254700000000"
                        value={guardianPhone}
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2 sm:col-span-1">
                      <label
                        className="text-xs font-medium text-muted-foreground"
                        htmlFor={`${fieldId}-guardian-email`}
                      >
                        Email address
                      </label>
                      <input
                        id={`${fieldId}-guardian-email`}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                        onChange={(e) => setGuardianEmail(e.target.value)}
                        placeholder="e.g. grace@example.com"
                        type="email"
                        value={guardianEmail}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    At least one contact method (email or phone) is required.
                  </p>
                </div>
              )}

              {/* Relationship & Permissions */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor={`${fieldId}-relationship`}
                  >
                    Relationship <span className="text-destructive">*</span>
                  </label>
                  <select
                    id={`${fieldId}-relationship`}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(e) => setRelationship(e.target.value)}
                    value={relationship}
                  >
                    <option value="Parent">Parent</option>
                    <option value="Mother">Mother</option>
                    <option value="Father">Father</option>
                    <option value="Guardian">Guardian</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Grandparent">Grandparent</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1.5 col-span-2 sm:col-span-1 flex flex-col justify-end">
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input
                      checked={authorizedAccess}
                      className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
                      onChange={(e) => setAuthorizedAccess(e.target.checked)}
                      type="checkbox"
                    />
                    <span className="text-xs font-medium text-foreground">Authorized Contact</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <SheetFooter className="border-t pt-4">
            <Button
              disabled={createMutation.isPending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? "Creating..." : "Create Application"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// -----------------------------------------------------------------------------
// Component: ApplicationDetailSheet
// -----------------------------------------------------------------------------

function ApplicationDetailSheet({
  application,
  open,
  onClose,
  onEditClick,
  onAdmitClick,
}: {
  application: AdmissionApplication;
  open: boolean;
  onClose: () => void;
  onEditClick: () => void;
  onAdmitClick: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const canCreate = Boolean(school?.permissions.includes("admissions.application.create"));
  const canReview = Boolean(school?.permissions.includes("admissions.application.review"));
  const canAdmit = Boolean(school?.permissions.includes("admissions.application.admit"));
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const transitionMutation = useMutation({
    mutationFn: async (transition: "submit" | "review" | "accept" | "reject" | "withdraw") => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(
        `/schools/${school.id}/admission-applications/${application.id}/transitions`,
        {
          method: "POST",
          body: { transition },
        },
      );
    },
    onSuccess: () => {
      setTransitionError(null);
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/admission-applications"],
      });
    },
    onError: (err) => {
      setTransitionError(err instanceof Error ? err.message : "Failed to transition application.");
    },
  });

  const fullName = [application.givenName, application.middleName, application.familyName]
    .filter(Boolean)
    .join(" ");

  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between pr-4">
            <ApplicationStatusBadge status={application.status} />
            {application.possibleDuplicate && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                Possible Duplicate
              </span>
            )}
          </div>
          <SheetTitle className="text-xl">{fullName}</SheetTitle>
          <SheetDescription>
            Application ID: <span className="font-mono text-xs">{application.id.slice(0, 8)}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {transitionError && (
            <div
              className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2"
              role="alert"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{transitionError}</span>
            </div>
          )}

          {application.possibleDuplicate && (
            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200 flex items-start gap-2">
              <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Duplicate record notice:</strong> An application or learner with this name
                already exists in this school. Please verify before accepting.
              </div>
            </div>
          )}

          {/* Applicant Info */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Applicant Details
            </h4>
            <div className="rounded-lg border bg-card p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Full Name:</span>
                <span className="font-medium text-foreground">{fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date of Birth:</span>
                <span className="font-medium text-foreground">
                  {application.dateOfBirth ? application.dateOfBirth : "Not recorded"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created:</span>
                <span className="text-foreground">
                  {new Date(application.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Guardians */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Associated Guardians ({application.guardians.length})
            </h4>
            <div className="space-y-2">
              {application.guardians.map((g) => (
                <div
                  key={
                    g.id ??
                    g.guardianId ??
                    g.existingGuardianId ??
                    [
                      g.givenName,
                      g.middleName,
                      g.familyName,
                      g.email,
                      g.phone,
                      g.relationship,
                    ].join("|")
                  }
                  className="rounded-lg border bg-card p-3 text-sm space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {[g.givenName, g.middleName, g.familyName].filter(Boolean).join(" ")}
                    </span>
                    <Badge variant={g.authorizedAccess ? "default" : "outline"}>
                      {g.relationship}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {g.phone && <span>Phone: {g.phone}</span>}
                    {g.phone && g.email && <span> • </span>}
                    {g.email && <span>Email: {g.email}</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {g.authorizedAccess
                      ? "Authorized emergency contact"
                      : "Secondary / unauthorized contact"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workflow Transition Actions */}
          <div className="space-y-3">
            {(canCreate || canReview || canAdmit) && (
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Workflow Actions
              </h4>
            )}

            {application.status === "DRAFT" && canCreate && (
              <div className="flex flex-col gap-2">
                {canCreate && (
                  <>
                    <Button
                      className="w-full justify-start gap-2"
                      disabled={transitionMutation.isPending}
                      onClick={() => transitionMutation.mutate("submit")}
                    >
                      <ArrowRight className="size-4" />
                      Submit Application
                    </Button>
                    <Button
                      className="w-full justify-start gap-2"
                      onClick={onEditClick}
                      variant="outline"
                    >
                      Edit Draft
                    </Button>
                    <Button
                      className="w-full justify-start gap-2 text-rose-600 hover:text-rose-700"
                      disabled={transitionMutation.isPending}
                      onClick={() => transitionMutation.mutate("withdraw")}
                      variant="ghost"
                    >
                      <XCircle className="size-4" />
                      Withdraw Application
                    </Button>
                  </>
                )}
              </div>
            )}

            {application.status === "SUBMITTED" && (canReview || canCreate) && (
              <div className="flex flex-col gap-2">
                {canReview && (
                  <Button
                    className="w-full justify-start gap-2"
                    disabled={transitionMutation.isPending}
                    onClick={() => transitionMutation.mutate("review")}
                  >
                    <Clock className="size-4" />
                    Mark Under Review
                  </Button>
                )}
                {canCreate && (
                  <Button
                    className="w-full justify-start gap-2 text-rose-600 hover:text-rose-700"
                    disabled={transitionMutation.isPending}
                    onClick={() => transitionMutation.mutate("withdraw")}
                    variant="ghost"
                  >
                    <XCircle className="size-4" />
                    Withdraw Application
                  </Button>
                )}
              </div>
            )}

            {application.status === "UNDER_REVIEW" && (canReview || canCreate) && (
              <div className="flex flex-col gap-2">
                {canReview && (
                  <>
                    <Button
                      className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-700"
                      disabled={transitionMutation.isPending}
                      onClick={() => transitionMutation.mutate("accept")}
                    >
                      <CheckCircle2 className="size-4" />
                      Accept Application
                    </Button>
                    <Button
                      className="w-full justify-start gap-2 text-rose-600 hover:text-rose-700"
                      disabled={transitionMutation.isPending}
                      onClick={() => transitionMutation.mutate("reject")}
                      variant="outline"
                    >
                      <XCircle className="size-4" />
                      Reject Application
                    </Button>
                  </>
                )}
                {canCreate && (
                  <Button
                    className="w-full justify-start gap-2 text-muted-foreground"
                    disabled={transitionMutation.isPending}
                    onClick={() => transitionMutation.mutate("withdraw")}
                    variant="ghost"
                  >
                    Withdraw
                  </Button>
                )}
              </div>
            )}

            {application.status === "ACCEPTED" && (canAdmit || canCreate) && (
              <div className="flex flex-col gap-2">
                {canAdmit && (
                  <Button
                    className="w-full justify-start gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                    onClick={onAdmitClick}
                  >
                    <GraduationCap className="size-4" />
                    Admit Student & Assign Class
                  </Button>
                )}
                {canCreate && (
                  <Button
                    className="w-full justify-start gap-2 text-rose-600 hover:text-rose-700"
                    disabled={transitionMutation.isPending}
                    onClick={() => transitionMutation.mutate("withdraw")}
                    variant="ghost"
                  >
                    Withdraw
                  </Button>
                )}
              </div>
            )}

            {application.status === "ADMITTED" && (
              <div className="rounded-lg bg-purple-50 p-4 border border-purple-200 text-purple-900 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <UserCheck className="size-5 text-purple-600" />
                  <span>Student Admitted</span>
                </div>
                <p className="text-xs text-purple-800">
                  This learner has been formally admitted into the school system.
                </p>
                <div className="pt-2">
                  <Link
                    to="/students"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:underline"
                  >
                    View in Student Directory
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
              </div>
            )}

            {application.status === "REJECTED" && (
              <div className="rounded-lg bg-rose-50 p-4 border border-rose-200 text-rose-800 text-xs">
                This application was rejected on{" "}
                {application.rejectedAt
                  ? new Date(application.rejectedAt).toLocaleDateString()
                  : "review"}
                .
              </div>
            )}

            {application.status === "WITHDRAWN" && (
              <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200 text-zinc-700 text-xs">
                This application was withdrawn.
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="border-t pt-4">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// -----------------------------------------------------------------------------
// Component: EditDraftApplicationSheet
// -----------------------------------------------------------------------------

function EditDraftApplicationSheet({
  application,
  open,
  onClose,
  onUpdated,
}: {
  application: AdmissionApplication;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const fieldId = useId();

  const [givenName, setGivenName] = useState(application.givenName);
  const [middleName, setMiddleName] = useState(application.middleName ?? "");
  const [familyName, setFamilyName] = useState(application.familyName);
  const [dateOfBirth, setDateOfBirth] = useState(application.dateOfBirth ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");

      const payload = {
        givenName: givenName.trim(),
        middleName: middleName.trim() || null,
        familyName: familyName.trim(),
        dateOfBirth: dateOfBirth || null,
        guardians: application.guardians.map((g) => ({
          ...(g.guardianId
            ? { existingGuardianId: g.guardianId }
            : {
                givenName: g.givenName,
                middleName: g.middleName ?? null,
                familyName: g.familyName,
                email: g.email ?? null,
                phone: g.phone ?? null,
              }),
          relationship: g.relationship,
          authorizedAccess: g.authorizedAccess,
        })),
      };

      return apiRequest(`/schools/${school.id}/admission-applications/${application.id}`, {
        method: "PATCH",
        body: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/admission-applications"],
      });
      onUpdated();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to update draft.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!givenName.trim() || !familyName.trim()) {
      setFormError("Given name and family name are required.");
      return;
    }
    editMutation.mutate();
  };

  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <SheetHeader>
            <SheetTitle>Edit Draft Application</SheetTitle>
            <SheetDescription>Update details before submitting for review.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 py-6">
            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${fieldId}-given`}
              >
                Given name <span className="text-destructive">*</span>
              </label>
              <input
                id={`${fieldId}-given`}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(e) => setGivenName(e.target.value)}
                required
                value={givenName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${fieldId}-middle`}
              >
                Middle name
              </label>
              <input
                id={`${fieldId}-middle`}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(e) => setMiddleName(e.target.value)}
                value={middleName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${fieldId}-family`}
              >
                Family name <span className="text-destructive">*</span>
              </label>
              <input
                id={`${fieldId}-family`}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(e) => setFamilyName(e.target.value)}
                required
                value={familyName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${fieldId}-dob`}
              >
                Date of birth
              </label>
              <input
                id={`${fieldId}-dob`}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(e) => setDateOfBirth(e.target.value)}
                type="date"
                value={dateOfBirth}
              />
            </div>
          </div>

          <SheetFooter className="border-t pt-4">
            <Button
              disabled={editMutation.isPending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={editMutation.isPending} type="submit">
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// -----------------------------------------------------------------------------
// Component: AdmitStudentDialog
// -----------------------------------------------------------------------------

function AdmitStudentDialog({
  application,
  open,
  onClose,
  onAdmitted,
}: {
  application: AdmissionApplication;
  open: boolean;
  onClose: () => void;
  onAdmitted: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const fieldId = useId();

  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [admitError, setAdmitError] = useState<string | null>(null);

  // Load active academic years
  const yearsQuery = useSchoolList<AcademicYear>(
    "/academic-years",
    { limit: 100 },
    { enabled: open },
  );

  // Load classes belonging to selected academic year
  const classesQuery = useSchoolList<ClassRecord>(
    "/classes",
    { academicYearId: academicYearId || undefined, limit: 100 },
    { enabled: open && Boolean(academicYearId) },
  );

  // Load streams belonging to selected class
  const streamsQuery = useSchoolList<StreamRecord>(
    "/streams",
    { classId: classId || undefined, limit: 100 },
    { enabled: open && Boolean(classId) },
  );

  const admitMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");

      const payload = {
        academicYearId,
        classId,
        ...(streamId ? { streamId } : {}),
      };

      return apiRequest(`/schools/${school.id}/admission-applications/${application.id}/admit`, {
        method: "POST",
        body: payload,
      });
    },
    onSuccess: () => {
      // Invalidate both admissions and students lists!
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/admission-applications"],
      });
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/students"],
      });
      onAdmitted();
    },
    onError: (err) => {
      setAdmitError(err instanceof Error ? err.message : "Failed to admit application.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdmitError(null);

    if (!academicYearId) {
      setAdmitError("Please select an academic year.");
      return;
    }
    if (!classId) {
      setAdmitError("Please select a class for placement.");
      return;
    }

    admitMutation.mutate();
  };

  const fullName = [application.givenName, application.middleName, application.familyName]
    .filter(Boolean)
    .join(" ");

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Admit Learner</DialogTitle>
            <DialogDescription>
              Assign <strong>{fullName}</strong> to an academic year, class, and optional stream to
              generate an admission number and learner profile.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {admitError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{admitError}</span>
              </div>
            )}

            {/* Academic Year */}
            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${fieldId}-year`}
              >
                Academic Year <span className="text-destructive">*</span>
              </label>
              <select
                id={`${fieldId}-year`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(e) => {
                  setAcademicYearId(e.target.value);
                  setClassId("");
                  setStreamId("");
                }}
                required
                value={academicYearId}
              >
                <option value="">Select Academic Year...</option>
                {yearsQuery.data?.data
                  .filter((y) => y.status === "ACTIVE")
                  .map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name} ({year.startsOn.slice(0, 4)})
                    </option>
                  ))}
              </select>
            </div>

            {/* Class */}
            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${fieldId}-class`}
              >
                Class <span className="text-destructive">*</span>
              </label>
              <select
                id={`${fieldId}-class`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!academicYearId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setStreamId("");
                }}
                required
                value={classId}
              >
                <option value="">
                  {!academicYearId ? "Select an Academic Year first" : "Select Class..."}
                </option>
                {classesQuery.data?.data
                  .filter((c) => c.status === "ACTIVE")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Stream */}
            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${fieldId}-stream`}
              >
                Stream / Section <span className="text-xs text-muted-foreground">(Optional)</span>
              </label>
              <select
                id={`${fieldId}-stream`}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!classId}
                onChange={(e) => setStreamId(e.target.value)}
                value={streamId}
              >
                <option value="">
                  {!classId
                    ? "Select a Class first"
                    : streamsQuery.data?.data.length === 0
                      ? "No streams configured for this class"
                      : "Unassigned / No specific stream"}
                </option>
                {streamsQuery.data?.data
                  .filter((s) => s.status === "ACTIVE")
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              disabled={admitMutation.isPending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={admitMutation.isPending}
              type="submit"
            >
              {admitMutation.isPending ? "Admitting..." : "Admit Learner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
