import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Briefcase,
  Building2,
  Edit2,
  GraduationCap,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { useId, useState } from "react";
import { useAuth } from "@/app/auth-provider";
import { RequestError, RequestLoading } from "@/components/api/request-state";
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
import { useSchoolData, useSchoolList } from "@/lib/api/school-data";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type StaffStatus = "ACTIVE" | "INACTIVE";

export type StaffDepartmentRecord = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
};

export type StaffMember = {
  id: string;
  staffNumber: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  positionTitle: string;
  departmentId: string | null;
  department: StaffDepartmentRecord | null;
  userId: string | null;
  status: StaffStatus;
  createdAt: string;
  updatedAt: string;
};

export type StaffEmploymentRecord = {
  id: string;
  staffId: string;
  positionTitle: string;
  startsOn: string;
  endsOn: string | null;
  createdAt: string;
};

export type StaffAssignmentRecord =
  | {
      kind: "CLASS";
      id: string;
      classId: string;
      streamId: string | null;
      classSubjectAssignmentId?: null;
      createdAt: string;
      endedAt: string | null;
    }
  | {
      kind: "SUBJECT";
      id: string;
      classId?: null;
      streamId?: null;
      classSubjectAssignmentId: string;
      createdAt: string;
      endedAt: string | null;
    };

type AcademicClass = {
  id: string;
  name: string;
  academicYearId: string;
  status: "ACTIVE" | "INACTIVE";
};

type StaffAcademicYear = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

type ClassStream = {
  id: string;
  name: string;
  classId: string;
  status: "ACTIVE" | "INACTIVE";
};

type SubjectRecord = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

type ClassSubjectRecord = {
  id: string;
  classId: string;
  subjectId: string;
  status: "ACTIVE" | "INACTIVE";
};

function StaffStatusBadge({ status }: { status: StaffStatus }) {
  const isPending = status === "ACTIVE";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        isPending
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-zinc-100 text-zinc-600 border-zinc-200"
      }`}
    >
      {status === "ACTIVE" ? "Active" : "Inactive"}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Main Staff & Teachers Page
// -----------------------------------------------------------------------------

export function StaffPage() {
  const { school } = useAuth();
  const canReadStaff = Boolean(school?.permissions.includes("staff.profile.read"));
  const canManageStaff = Boolean(school?.permissions.includes("staff.profile.manage"));
  const defaultPageSize = 25;
  const [activeTab, setActiveTab] = useState<"staff" | "departments">("staff");

  // Staff search & filters
  const [staffSearch, setStaffSearch] = useState("");
  const [staffStatusFilter, setStaffStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [staffOffset, setStaffOffset] = useState(0);
  const [staffPageSize, setStaffPageSize] = useState(defaultPageSize);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  // Department search & filters
  const [deptSearch, setDeptSearch] = useState("");
  const [deptStatusFilter, setDeptStatusFilter] = useState("all");
  const [departmentOffset, setDepartmentOffset] = useState(0);
  const [departmentPageSize, setDepartmentPageSize] = useState(defaultPageSize);
  const [editingDepartment, setEditingDepartment] = useState<StaffDepartmentRecord | null>(null);
  const [deactivatingDepartment, setDeactivatingDepartment] = useState<StaffDepartmentRecord | null>(null);

  // Sheets / Modals
  const [isCreateStaffOpen, setIsCreateStaffOpen] = useState(false);
  const [isCreateDeptOpen, setIsCreateDeptOpen] = useState(false);

  // Queries
  const staffQuery = useSchoolList<StaffMember>("/staff", {
    limit: staffPageSize,
    offset: staffOffset,
    q: staffSearch.trim() || undefined,
    status: staffStatusFilter === "all" ? undefined : staffStatusFilter,
    departmentId: departmentFilter === "all" ? undefined : departmentFilter,
    sortBy: "familyName",
    sortOrder: "asc",
  }, { enabled: canReadStaff });

  const departmentsQuery = useSchoolList<StaffDepartmentRecord>("/departments", {
    limit: departmentPageSize,
    offset: departmentOffset,
    q: deptSearch.trim() || undefined,
    status: deptStatusFilter === "all" ? undefined : deptStatusFilter,
    sortOrder: "asc",
  }, { enabled: canReadStaff });

  const selectedStaff = staffQuery.data?.data.find((s) => s.id === selectedStaffId);

  if (!canReadStaff) {
    return (
      <Card className="shadow-none">
        <CardContent className="p-6">
          <UnauthorizedState
            description="Your school access does not include permission to view staff profiles and departments."
            title="Staff access denied"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="max-w-2xl space-y-2">
          <p className="text-sm font-medium text-primary">People operations</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Staff, Teachers & Assignments
          </h2>
          <p className="text-sm leading-6 text-muted-foreground sm:text-base">
            Manage school personnel profiles, employment tenures, academic departments, and teaching assignments.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeTab === "staff" && canManageStaff ? (
            <Button className="gap-2" onClick={() => setIsCreateStaffOpen(true)}>
              <Plus className="size-4" />
              New Staff Profile
            </Button>
          ) : activeTab === "departments" && canManageStaff ? (
            <Button className="gap-2" onClick={() => setIsCreateDeptOpen(true)}>
              <Plus className="size-4" />
              New Department
            </Button>
          ) : null}
        </div>
      </section>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            aria-pressed={activeTab === "staff"}
            className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "staff"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground"
            }`}
            onClick={() => setActiveTab("staff")}
            type="button"
          >
            <Users className="size-4" />
            Staff & Teachers Directory
            {staffQuery.isError ? (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">Unavailable</span>
            ) : staffQuery.data ? (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                {staffQuery.data.meta.total}
              </span>
            ) : null}
          </button>

          <button
            aria-pressed={activeTab === "departments"}
            className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "departments"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground"
            }`}
            onClick={() => setActiveTab("departments")}
            type="button"
          >
            <Building2 className="size-4" />
            Departments
            {departmentsQuery.isError ? (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">Unavailable</span>
            ) : departmentsQuery.data ? (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                {departmentsQuery.data.meta.total}
              </span>
            ) : null}
          </button>
        </nav>
      </div>

      {/* Tab 1: Staff & Teachers Directory */}
      {activeTab === "staff" && (
        <section aria-labelledby="staff-directory-heading" className="space-y-4">
          <Card className="shadow-none">
            <CardContent className="space-y-5 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="relative block">
                  <span className="sr-only">Search by staff name or staff ID</span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => {
                      setStaffSearch(event.target.value);
                      setStaffOffset(0);
                      setStaffPageSize(defaultPageSize);
                    }}
                    placeholder="Name or staff number"
                    type="search"
                    value={staffSearch}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Department</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(e) => {
                      setDepartmentFilter(e.target.value);
                      setStaffOffset(0);
                      setStaffPageSize(defaultPageSize);
                    }}
                    value={departmentFilter}
                  >
                    <option value="all">All departments</option>
                    {departmentsQuery.data?.data
                      .filter((d) => d.status === "ACTIVE")
                      .map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Status</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => {
                      setStaffStatusFilter(event.target.value);
                      setStaffOffset(0);
                      setStaffPageSize(defaultPageSize);
                    }}
                    value={staffStatusFilter}
                  >
                    <option value="all">All statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </label>
              </div>

              <div aria-live="polite" className="overflow-hidden rounded-lg border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                    <caption className="sr-only">Staff directory</caption>
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium" scope="col">Staff Number</th>
                        <th className="px-4 py-3 font-medium" scope="col">Full Name</th>
                        <th className="px-4 py-3 font-medium" scope="col">Department</th>
                        <th className="px-4 py-3 font-medium" scope="col">Position Title</th>
                        <th className="px-4 py-3 font-medium" scope="col">Contact</th>
                        <th className="px-4 py-3 font-medium" scope="col">Status</th>
                        <th className="px-4 py-3 text-right font-medium" scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffQuery.isPending ? (
                        <tr><td colSpan={7}><RequestLoading /></td></tr>
                      ) : staffQuery.isError ? (
                        <tr>
                          <td colSpan={7}>
                            <div className="space-y-3 p-4">
                              <RequestError error={staffQuery.error} />
                              <Button
                                disabled={staffQuery.isFetching}
                                onClick={() => void staffQuery.refetch()}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Retry loading staff
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : staffQuery.data.data.length === 0 ? (
                        <tr>
                          <td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={7}>
                            No staff profiles found matching your search.
                          </td>
                        </tr>
                      ) : (
                        staffQuery.data.data.map((member) => {
                          const fullName = [member.givenName, member.middleName, member.familyName]
                            .filter(Boolean)
                            .join(" ");

                          return (
                            <tr
                              className="border-t"
                              key={member.id}
                            >
                              <td className="px-4 py-3 font-mono font-medium text-foreground">
                                {member.staffNumber}
                              </td>
                              <td className="px-4 py-3 font-medium">{fullName}</td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {member.department?.name ?? "Unassigned"}
                              </td>
                              <td className="px-4 py-3">{member.positionTitle}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {member.contactPhone || member.contactEmail || "—"}
                              </td>
                              <td className="px-4 py-3">
                                <StaffStatusBadge status={member.status} />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  aria-label={`View details for ${fullName}`}
                                  onClick={() => setSelectedStaffId(member.id)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  View details
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

              {!staffQuery.isError && !staffQuery.isPending && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p aria-live="polite" className="text-xs text-muted-foreground">
                    Showing{" "}
                    {staffQuery.data.meta.total === 0 ? 0 : staffQuery.data.meta.offset + 1}–
                    {staffQuery.data.meta.offset + staffQuery.data.data.length} of{" "}
                    {staffQuery.data.meta.total} staff profiles.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      disabled={staffQuery.data.meta.offset === 0}
                      onClick={() => {
                        setStaffPageSize(staffQuery.data.meta.limit);
                        setStaffOffset(
                          Math.max(0, staffQuery.data.meta.offset - staffQuery.data.meta.limit),
                        );
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Previous
                    </Button>
                    <Button
                      disabled={
                        staffQuery.data.meta.offset + staffQuery.data.data.length >=
                        staffQuery.data.meta.total
                      }
                      onClick={() => {
                        setStaffPageSize(staffQuery.data.meta.limit);
                        setStaffOffset(staffQuery.data.meta.offset + staffQuery.data.meta.limit);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Tab 2: Departments Directory */}
      {activeTab === "departments" && (
        <section aria-labelledby="departments-heading" className="space-y-4">
          <Card className="shadow-none">
            <CardContent className="space-y-5 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
                <label className="relative block">
                  <span className="sr-only">Search departments</span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(e) => {
                      setDeptSearch(e.target.value);
                      setDepartmentOffset(0);
                      setDepartmentPageSize(defaultPageSize);
                    }}
                    placeholder="Search departments"
                    type="search"
                    value={deptSearch}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Status</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(e) => {
                      setDeptStatusFilter(e.target.value);
                      setDepartmentOffset(0);
                      setDepartmentPageSize(defaultPageSize);
                    }}
                    value={deptStatusFilter}
                  >
                    <option value="all">All statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </label>
              </div>

              <div aria-live="polite" className="overflow-hidden rounded-lg border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] border-collapse text-left text-sm">
                    <caption className="sr-only">Department list</caption>
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium" scope="col">Department Name</th>
                        <th className="px-4 py-3 font-medium" scope="col">Created</th>
                        <th className="px-4 py-3 font-medium" scope="col">Status</th>
                        <th className="px-4 py-3 text-right font-medium" scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departmentsQuery.isPending ? (
                        <tr><td colSpan={4}><RequestLoading /></td></tr>
                      ) : departmentsQuery.isError ? (
                        <tr><td colSpan={4}><RequestError error={departmentsQuery.error} /></td></tr>
                      ) : departmentsQuery.data.data.length === 0 ? (
                        <tr>
                          <td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={4}>
                            No departments found.
                          </td>
                        </tr>
                      ) : (
                        departmentsQuery.data.data.map((dept) => (
                          <tr className="border-t" key={dept.id}>
                            <td className="px-4 py-3 font-medium text-foreground">{dept.name}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {new Date(dept.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={dept.status === "ACTIVE" ? "default" : "outline"}>
                                {dept.status.toLowerCase()}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right space-x-2">
                              {canManageStaff && (
                                <Button
                                  onClick={() => setEditingDepartment(dept)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  Edit
                                </Button>
                              )}
                              {canManageStaff && dept.status === "ACTIVE" && (
                                <Button
                                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                  onClick={() => setDeactivatingDepartment(dept)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  Deactivate
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {!departmentsQuery.isError && !departmentsQuery.isPending && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p aria-live="polite" className="text-xs text-muted-foreground">
                    Showing{" "}
                    {departmentsQuery.data.meta.total === 0 ? 0 : departmentsQuery.data.meta.offset + 1}–
                    {departmentsQuery.data.meta.offset + departmentsQuery.data.data.length} of{" "}
                    {departmentsQuery.data.meta.total} departments.
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      disabled={departmentsQuery.data.meta.offset === 0}
                      onClick={() => {
                        setDepartmentPageSize(departmentsQuery.data.meta.limit);
                        setDepartmentOffset(
                          Math.max(
                            0,
                            departmentsQuery.data.meta.offset - departmentsQuery.data.meta.limit,
                          ),
                        );
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Previous
                    </Button>
                    <Button
                      disabled={
                        departmentsQuery.data.meta.offset + departmentsQuery.data.data.length >=
                        departmentsQuery.data.meta.total
                      }
                      onClick={() => {
                        setDepartmentPageSize(departmentsQuery.data.meta.limit);
                        setDepartmentOffset(
                          departmentsQuery.data.meta.offset + departmentsQuery.data.meta.limit,
                        );
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Create Staff Sheet */}
      <CreateStaffSheet
        onClose={() => setIsCreateStaffOpen(false)}
        onCreated={(id) => {
          setIsCreateStaffOpen(false);
          setSelectedStaffId(id);
        }}
        open={isCreateStaffOpen}
      />

      {/* Staff Detail & Management Sheet */}
      {selectedStaff && (
        <StaffDetailSheet
          onClose={() => setSelectedStaffId(null)}
          open={Boolean(selectedStaffId)}
          staff={selectedStaff}
        />
      )}

      {/* Create Department Modal */}
      <CreateDepartmentDialog
        onClose={() => setIsCreateDeptOpen(false)}
        onCreated={() => setIsCreateDeptOpen(false)}
        open={isCreateDeptOpen}
      />

      {/* Edit Department Modal */}
      {editingDepartment && (
        <EditDepartmentDialog
          department={editingDepartment}
          onClose={() => setEditingDepartment(null)}
          onUpdated={() => setEditingDepartment(null)}
          open={Boolean(editingDepartment)}
        />
      )}

      {/* Deactivate Department Confirmation */}
      {deactivatingDepartment && (
        <DeactivateDepartmentDialog
          department={deactivatingDepartment}
          onClose={() => setDeactivatingDepartment(null)}
          onDeactivated={() => setDeactivatingDepartment(null)}
          open={Boolean(deactivatingDepartment)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Component: CreateStaffSheet
// -----------------------------------------------------------------------------

function CreateStaffSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const formId = useId();

  const [staffNumber, setStaffNumber] = useState("");
  const [givenName, setGivenName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [positionTitle, setPositionTitle] = useState("Teacher");
  const [departmentId, setDepartmentId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Departments list for picker
  const departmentsQuery = useSchoolList<StaffDepartmentRecord>(
    "/departments",
    { limit: 100 },
    { enabled: open },
  );

  const resetForm = () => {
    setStaffNumber("");
    setGivenName("");
    setMiddleName("");
    setFamilyName("");
    setContactEmail("");
    setContactPhone("");
    setPositionTitle("Teacher");
    setDepartmentId("");
    setFormError(null);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");

      const payload = {
        staffNumber: staffNumber.trim(),
        givenName: givenName.trim(),
        middleName: middleName.trim() || null,
        familyName: familyName.trim(),
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        positionTitle: positionTitle.trim(),
        departmentId: departmentId || null,
      };

      const res = await apiRequest<{ data: StaffMember }>(
        `/schools/${school.id}/staff`,
        {
          method: "POST",
          body: payload,
        },
      );
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/staff"],
      });
      resetForm();
      onCreated(data.id);
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to create staff profile.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!staffNumber.trim() || !givenName.trim() || !familyName.trim() || !positionTitle.trim()) {
      setFormError("Staff number, given name, family name, and position title are required.");
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
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <SheetHeader>
            <SheetTitle>New Staff Profile</SheetTitle>
            <SheetDescription>
              Register a teacher, department head, or administrator.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 py-6">
            {formError && (
              <div
                className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2"
                role="alert"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-staff-number`}
              >
                Staff Number / Employee ID <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-staff-number`}
                onChange={(e) => setStaffNumber(e.target.value)}
                placeholder="e.g. EMP-001 or T-2026-01"
                required
                value={staffNumber}
              />
            </div>

            <fieldset className="space-y-1.5">
              <legend className="sr-only">Staff name</legend>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor={`${formId}-given-name`}
                  >
                    Given name <span className="text-destructive">*</span>
                  </label>
                  <input
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    id={`${formId}-given-name`}
                    onChange={(e) => setGivenName(e.target.value)}
                    placeholder="e.g. David"
                    required
                    value={givenName}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor={`${formId}-middle-name`}
                  >
                    Middle name
                  </label>
                  <input
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    id={`${formId}-middle-name`}
                    onChange={(e) => setMiddleName(e.target.value)}
                    placeholder="Optional"
                    value={middleName}
                  />
                </div>
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-family-name`}
              >
                Family name <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-family-name`}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="e.g. Kariuki"
                required
                value={familyName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-position-title`}
              >
                Position Title <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-position-title`}
                onChange={(e) => setPositionTitle(e.target.value)}
                placeholder="e.g. Mathematics Teacher"
                required
                value={positionTitle}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-department`}
              >
                Department
              </label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-department`}
                onChange={(e) => setDepartmentId(e.target.value)}
                value={departmentId}
              >
                <option value="">Unassigned (No Department)</option>
                {departmentsQuery.data?.data
                  .filter((d) => d.status === "ACTIVE")
                  .map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor={`${formId}-contact-phone`}
                >
                  Phone number
                </label>
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                  id={`${formId}-contact-phone`}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+254700000000"
                  value={contactPhone}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor={`${formId}-contact-email`}
                >
                  Contact email
                </label>
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                  id={`${formId}-contact-email`}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="staff@school.org"
                  type="email"
                  value={contactEmail}
                />
              </div>
            </div>
          </div>

          <SheetFooter className="border-t pt-4">
            <Button disabled={createMutation.isPending} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? "Creating..." : "Create Profile"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// -----------------------------------------------------------------------------
// Component: StaffDetailSheet
// -----------------------------------------------------------------------------

function StaffDetailSheet({
  staff,
  open,
  onClose,
}: {
  staff: StaffMember;
  open: boolean;
  onClose: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const permissions = school?.permissions ?? [];
  const canManageProfile = permissions.includes("staff.profile.manage");
  const canReadAssignments = permissions.includes("staff.assignment.read");
  const canManageAssignments = permissions.includes("staff.assignment.manage");
  const canReadEmployment = permissions.includes("staff.employment.read");
  const canManageEmployment = permissions.includes("staff.employment.manage");

  // Modals inside details
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isAssignClassOpen, setIsAssignClassOpen] = useState(false);
  const [isAssignSubjectOpen, setIsAssignSubjectOpen] = useState(false);
  const [isStartEmploymentOpen, setIsStartEmploymentOpen] = useState(false);
  const [endingEmploymentId, setEndingEmploymentId] = useState<string | null>(null);

  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  // Queries for Staff details
  const assignmentsQuery = useSchoolData<{ data: StaffAssignmentRecord[] }>(
    `/staff/${staff.id}/assignments`,
    { limit: 50 },
    { enabled: open && canReadAssignments },
  );

  const employmentsQuery = useSchoolData<{ data: StaffEmploymentRecord[] }>(
    `/staff/${staff.id}/employments`,
    { limit: 50 },
    { enabled: open && canReadEmployment },
  );

  const assignmentLookupPaths = Array.from(
    new Set(
      (assignmentsQuery.data?.data ?? []).flatMap((assignment) =>
        assignment.kind === "CLASS"
          ? [
              `/classes/${assignment.classId}`,
              ...(assignment.streamId ? [`/streams/${assignment.streamId}`] : []),
            ]
          : [`/class-subjects/${assignment.classSubjectAssignmentId}`],
      ),
    ),
  );
  const assignmentLookups = useQueries({
    queries: assignmentLookupPaths.map((path) => ({
      queryKey: ["school-data", school?.id, path, ""],
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (!school?.id) throw new Error("No school selected.");
        return apiRequest<AcademicClass | ClassStream | ClassSubjectRecord>(
          `/schools/${encodeURIComponent(school.id)}${path}`,
          { signal },
        );
      },
      enabled: open && Boolean(school?.id),
    })),
  });
  const linkedClassSubjectRecords = assignmentLookups.flatMap((query) => {
    const record = query.data;
    return record &&
      typeof record === "object" &&
      "classId" in record &&
      "subjectId" in record &&
      typeof record.classId === "string" &&
      typeof record.subjectId === "string"
      ? [record]
      : [];
  });
  const referenceLookupPaths = Array.from(
    new Set([
      ...(assignmentsQuery.data?.data ?? [])
        .filter((assignment): assignment is Extract<StaffAssignmentRecord, { kind: "CLASS" }> =>
          assignment.kind === "CLASS",
        )
        .map((assignment) => `/classes/${assignment.classId}`),
      ...linkedClassSubjectRecords.flatMap((record) => [
        `/classes/${record.classId}`,
        `/subjects/${record.subjectId}`,
      ]),
    ]),
  );
  const referenceLookups = useQueries({
    queries: referenceLookupPaths.map((path) => ({
      queryKey: ["school-data", school?.id, path, ""],
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (!school?.id) throw new Error("No school selected.");
        return apiRequest<AcademicClass | SubjectRecord>(
          `/schools/${encodeURIComponent(school.id)}${path}`,
          { signal },
        );
      },
      enabled: open && Boolean(school?.id),
    })),
  });

  // End Class Assignment Mutation
  const endClassAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(
        `/schools/${school.id}/staff/${staff.id}/class-assignments/${assignmentId}/end`,
        { method: "POST" },
      );
    },
    onSuccess: () => {
      setAssignmentError(null);
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, `/staff/${staff.id}/assignments`],
      });
    },
    onError: (err) => {
      setAssignmentError(err instanceof Error ? err.message : "Failed to end class assignment.");
    },
  });

  // End Subject Assignment Mutation
  const endSubjectAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(
        `/schools/${school.id}/staff/${staff.id}/subject-assignments/${assignmentId}/end`,
        { method: "POST" },
      );
    },
    onSuccess: () => {
      setAssignmentError(null);
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, `/staff/${staff.id}/assignments`],
      });
    },
    onError: (err) => {
      setAssignmentError(err instanceof Error ? err.message : "Failed to end subject assignment.");
    },
  });

  const fullName = [staff.givenName, staff.middleName, staff.familyName].filter(Boolean).join(" ");

  // Helper mappings
  const lookupByPath = <T,>(paths: string[], results: Array<{ data: T | undefined }>, path: string) =>
    results[paths.indexOf(path)]?.data;
  const getClassName = (classId: string) => {
    const record = lookupByPath(referenceLookupPaths, referenceLookups, `/classes/${classId}`);
    return record && "name" in record ? record.name : classId.slice(0, 8);
  };
  const getStreamName = (streamId: string | null) => {
    if (!streamId) return null;
    const record = lookupByPath(assignmentLookupPaths, assignmentLookups, `/streams/${streamId}`);
    return record && "name" in record ? record.name : streamId.slice(0, 8);
  };
  const getClassSubjectLabel = (classSubjectId: string) => {
    const link = lookupByPath(
      assignmentLookupPaths,
      assignmentLookups,
      `/class-subjects/${classSubjectId}`,
    );
    if (!link || !("classId" in link) || !("subjectId" in link)) {
      return `Assignment #${classSubjectId.slice(0, 8)}`;
    }
    const className = getClassName(link.classId);
    const subjectPath = `/subjects/${link.subjectId}`;
    const subject = lookupByPath(referenceLookupPaths, referenceLookups, subjectPath);
    const subjectName = subject && "name" in subject ? subject.name : "Subject";
    return `${className} • ${subjectName}`;
  };

  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between pr-4">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Staff #{staff.staffNumber}
            </span>
            <StaffStatusBadge status={staff.status} />
          </div>
          <SheetTitle className="text-xl">{fullName}</SheetTitle>
          <SheetDescription>
            {staff.positionTitle} {staff.department ? `• ${staff.department.name}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            {canManageProfile && (
              <>
                <Button
                  className="gap-1.5"
                  onClick={() => setIsEditProfileOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <Edit2 className="size-3.5" />
                  Edit Profile
                </Button>
                <Button
                  className="gap-1.5 text-amber-700 hover:text-amber-800"
                  onClick={() => setIsStatusDialogOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  {staff.status === "ACTIVE" ? "Deactivate Profile" : "Reactivate Profile"}
                </Button>
              </>
            )}
          </div>

          {/* Personal & Contact Overview */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Profile Details
            </h4>
            <dl className="grid gap-x-4 gap-y-3 rounded-lg border bg-card p-3 text-sm sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <dt className="text-muted-foreground">Staff number</dt>
                <dd className="break-words font-mono font-medium">{staff.staffNumber}</dd>
              </div>
              <div className="min-w-0 space-y-1">
                <dt className="text-muted-foreground">Full name</dt>
                <dd className="break-words font-medium">{fullName}</dd>
              </div>
              <div className="min-w-0 space-y-1">
                <dt className="text-muted-foreground">Department</dt>
                <dd className="break-words">{staff.department?.name ?? "None"}</dd>
              </div>
              <div className="min-w-0 space-y-1">
                <dt className="text-muted-foreground">Position</dt>
                <dd className="break-words">{staff.positionTitle}</dd>
              </div>
              <div className="min-w-0 space-y-1">
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="break-words">{staff.contactPhone || "Not recorded"}</dd>
              </div>
              <div className="min-w-0 space-y-1">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="break-all">{staff.contactEmail || "Not recorded"}</dd>
              </div>
            </dl>
          </div>

          {/* Teaching & Class Assignments */}
          {canReadAssignments && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <GraduationCap className="size-3.5" />
                Teaching & Class Assignments
              </h4>
              {staff.status === "ACTIVE" && canManageAssignments && (
                <div className="flex gap-2">
                  <Button
                    className="gap-1 text-xs h-7"
                    onClick={() => setIsAssignClassOpen(true)}
                    size="sm"
                    variant="outline"
                  >
                    <Plus className="size-3" />
                    Assign Class
                  </Button>
                  <Button
                    className="gap-1 text-xs h-7"
                    onClick={() => setIsAssignSubjectOpen(true)}
                    size="sm"
                    variant="outline"
                  >
                    <Plus className="size-3" />
                    Assign Subject
                  </Button>
                </div>
              )}
            </div>

            {assignmentError && (
              <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{assignmentError}</span>
              </div>
            )}

            {assignmentsQuery.isPending ? (
              <RequestLoading />
            ) : assignmentsQuery.isError ? (
              <div className="space-y-3">
                <RequestError error={assignmentsQuery.error} />
                <Button
                  disabled={assignmentsQuery.isFetching}
                  onClick={() => void assignmentsQuery.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Retry loading assignments
                </Button>
              </div>
            ) : assignmentsQuery.data?.data.length === 0 ? (
              <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                No teaching assignments recorded for this staff member.
              </div>
            ) : (
              <div className="space-y-2">
                {assignmentsQuery.data?.data.map((assignment) => {
                  const isEnded = Boolean(assignment.endedAt);
                  const isClass = assignment.kind === "CLASS";

                  const label = isClass
                    ? `Class Teacher: ${getClassName(assignment.classId)}${
                        assignment.streamId ? ` • Stream ${getStreamName(assignment.streamId)}` : ""
                      }`
                    : `Subject Teacher: ${getClassSubjectLabel(assignment.classSubjectAssignmentId)}`;

                  return (
                    <div
                      key={assignment.id}
                      className="rounded-lg border bg-card p-3 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={isClass ? "default" : "secondary"}>
                            {isClass ? "Class Teacher" : "Subject"}
                          </Badge>
                          <span className="font-medium text-foreground">{label}</span>
                        </div>
                        <Badge variant={isEnded ? "outline" : "default"}>
                          {isEnded ? "Ended" : "Active"}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-muted-foreground pt-1">
                        <span>
                          Assigned: {new Date(assignment.createdAt).toLocaleDateString()}
                          {assignment.endedAt &&
                            ` • Ended: ${new Date(assignment.endedAt).toLocaleDateString()}`}
                        </span>

                        {!isEnded && canManageAssignments && (
                          <Button
                            className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            disabled={
                              endClassAssignmentMutation.isPending ||
                              endSubjectAssignmentMutation.isPending
                            }
                            onClick={() => {
                              if (isClass) {
                                endClassAssignmentMutation.mutate(assignment.id);
                              } else {
                                endSubjectAssignmentMutation.mutate(assignment.id);
                              }
                            }}
                            size="sm"
                            variant="ghost"
                          >
                            End Assignment
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

          {/* Employment Stints */}
          {canReadEmployment && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Briefcase className="size-3.5" />
                Employment Stints
              </h4>
              {staff.status === "ACTIVE" && canManageEmployment && (
                <Button
                  className="gap-1 text-xs h-7"
                  onClick={() => setIsStartEmploymentOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <Plus className="size-3" />
                  New Stint
                </Button>
              )}
            </div>

            {employmentsQuery.isPending ? (
              <RequestLoading />
            ) : employmentsQuery.isError ? (
              <div className="space-y-3">
                <RequestError error={employmentsQuery.error} />
                <Button
                  disabled={employmentsQuery.isFetching}
                  onClick={() => void employmentsQuery.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Retry loading employment history
                </Button>
              </div>
            ) : employmentsQuery.data?.data.length === 0 ? (
              <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                No formal employment stints recorded.
              </div>
            ) : (
              <div className="space-y-2">
                {employmentsQuery.data?.data.map((stint) => (
                  <div key={stint.id} className="rounded-lg border bg-card p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{stint.positionTitle}</span>
                      <Badge variant={stint.endsOn ? "outline" : "default"}>
                        {stint.endsOn ? "Ended" : "Current"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>
                        {new Date(stint.startsOn).toLocaleDateString()} —{" "}
                        {stint.endsOn ? new Date(stint.endsOn).toLocaleDateString() : "Present"}
                      </span>
                      {!stint.endsOn && canManageEmployment && (
                        <Button
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setEndingEmploymentId(stint.id)}
                          size="sm"
                          variant="ghost"
                        >
                          End Episode
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>

        <SheetFooter className="border-t pt-4">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </SheetFooter>
      </SheetContent>

      {/* Edit Staff Profile Modal */}
      <EditStaffProfileDialog
        onClose={() => setIsEditProfileOpen(false)}
        onSaved={() => setIsEditProfileOpen(false)}
        open={isEditProfileOpen}
        staff={staff}
      />

      {/* Change Staff Status Dialog */}
      <ChangeStaffStatusDialog
        onClose={() => setIsStatusDialogOpen(false)}
        onSaved={() => {
          setIsStatusDialogOpen(false);
          onClose();
        }}
        open={isStatusDialogOpen}
        staff={staff}
      />

      {/* Assign Class Teacher Modal */}
      <AssignClassTeacherDialog
        onAssigned={() => setIsAssignClassOpen(false)}
        onClose={() => setIsAssignClassOpen(false)}
        open={isAssignClassOpen}
        staffId={staff.id}
      />

      {/* Assign Subject Teacher Modal */}
      <AssignSubjectTeacherDialog
        onAssigned={() => setIsAssignSubjectOpen(false)}
        onClose={() => setIsAssignSubjectOpen(false)}
        open={isAssignSubjectOpen}
        staffId={staff.id}
      />

      {/* Start Employment Modal */}
      <StartEmploymentDialog
        onClose={() => setIsStartEmploymentOpen(false)}
        onStarted={() => setIsStartEmploymentOpen(false)}
        open={isStartEmploymentOpen}
        staffId={staff.id}
      />

      {/* End Employment Modal */}
      {endingEmploymentId && (
        <EndEmploymentDialog
          employmentId={endingEmploymentId}
          onClose={() => setEndingEmploymentId(null)}
          onEnded={() => setEndingEmploymentId(null)}
          open={Boolean(endingEmploymentId)}
          staffId={staff.id}
        />
      )}
    </Sheet>
  );
}

// -----------------------------------------------------------------------------
// Component: EditStaffProfileDialog
// -----------------------------------------------------------------------------

function EditStaffProfileDialog({
  staff,
  open,
  onClose,
  onSaved,
}: {
  staff: StaffMember;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const formId = useId();

  const [staffNumber, setStaffNumber] = useState(staff.staffNumber);
  const [givenName, setGivenName] = useState(staff.givenName);
  const [middleName, setMiddleName] = useState(staff.middleName ?? "");
  const [familyName, setFamilyName] = useState(staff.familyName);
  const [contactEmail, setContactEmail] = useState(staff.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(staff.contactPhone ?? "");
  const [positionTitle, setPositionTitle] = useState(staff.positionTitle);
  const [departmentId, setDepartmentId] = useState(staff.departmentId ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const departmentsQuery = useSchoolList<StaffDepartmentRecord>(
    "/departments",
    { limit: 100 },
    { enabled: open },
  );

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");

      const payload = {
        staffNumber: staffNumber.trim() || undefined,
        givenName: givenName.trim() || undefined,
        middleName: middleName.trim() || null,
        familyName: familyName.trim() || undefined,
        contactEmail: contactEmail.trim() || null,
        contactPhone: contactPhone.trim() || null,
        positionTitle: positionTitle.trim() || undefined,
        departmentId: departmentId || null,
      };

      return apiRequest(`/schools/${school.id}/staff/${staff.id}`, {
        method: "PATCH",
        body: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/staff"],
      });
      onSaved();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to update staff profile.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!staffNumber.trim() || !givenName.trim() || !familyName.trim() || !positionTitle.trim()) {
      setFormError("Staff number, given name, family name, and position title are required.");
      return;
    }
    editMutation.mutate();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Staff Profile</DialogTitle>
            <DialogDescription>
              Update staff details, position, or department assignment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-staff-number`}
              >
                Staff Number
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-staff-number`}
                onChange={(e) => setStaffNumber(e.target.value)}
                required
                value={staffNumber}
              />
            </div>

            <fieldset className="space-y-1.5">
              <legend className="sr-only">Staff name</legend>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor={`${formId}-given-name`}
                  >
                    Given name
                  </label>
                  <input
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    id={`${formId}-given-name`}
                    onChange={(e) => setGivenName(e.target.value)}
                    required
                    value={givenName}
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor={`${formId}-middle-name`}
                  >
                    Middle name
                  </label>
                  <input
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    id={`${formId}-middle-name`}
                    onChange={(e) => setMiddleName(e.target.value)}
                    value={middleName}
                  />
                </div>
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-family-name`}
              >
                Family name
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-family-name`}
                onChange={(e) => setFamilyName(e.target.value)}
                required
                value={familyName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-position-title`}
              >
                Position Title
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-position-title`}
                onChange={(e) => setPositionTitle(e.target.value)}
                required
                value={positionTitle}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-department`}
              >
                Department
              </label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-department`}
                onChange={(e) => setDepartmentId(e.target.value)}
                value={departmentId}
              >
                <option value="">Unassigned</option>
                {departmentsQuery.data?.data
                  .filter((d) => d.status === "ACTIVE")
                  .map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor={`${formId}-contact-phone`}
                >
                  Phone
                </label>
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                  id={`${formId}-contact-phone`}
                  onChange={(e) => setContactPhone(e.target.value)}
                  value={contactPhone}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor={`${formId}-contact-email`}
                >
                  Email
                </label>
                <input
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                  id={`${formId}-contact-email`}
                  onChange={(e) => setContactEmail(e.target.value)}
                  type="email"
                  value={contactEmail}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button disabled={editMutation.isPending} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={editMutation.isPending} type="submit">
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: ChangeStaffStatusDialog
// -----------------------------------------------------------------------------

function ChangeStaffStatusDialog({
  staff,
  open,
  onClose,
  onSaved,
}: {
  staff: StaffMember;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();

  const nextStatus: StaffStatus = staff.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  const [formError, setFormError] = useState<string | null>(null);

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(`/schools/${school.id}/staff/${staff.id}/status`, {
        method: "PATCH",
        body: { status: nextStatus },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/staff"],
      });
      onSaved();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to change status.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    statusMutation.mutate();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {nextStatus === "INACTIVE" ? "Deactivate Staff Profile" : "Reactivate Staff Profile"}
            </DialogTitle>
            <DialogDescription>
              {nextStatus === "INACTIVE"
                ? `Deactivating ${staff.givenName} ${staff.familyName} requires ending all active employment stints and teaching assignments first.`
                : `Reactivating ${staff.givenName} ${staff.familyName} will restore active status.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {nextStatus === "INACTIVE" && (
              <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
                <strong>Prerequisites for deactivation:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Active employment stints must be ended.</li>
                  <li>Active class and subject assignments must be ended.</li>
                  <li>Published timetable lessons must be unassigned.</li>
                </ul>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button disabled={statusMutation.isPending} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button
              className={
                nextStatus === "INACTIVE"
                  ? "bg-destructive text-destructive-foreground hover:opacity-90"
                  : ""
              }
              disabled={statusMutation.isPending}
              type="submit"
            >
              {statusMutation.isPending
                ? "Updating..."
                : nextStatus === "INACTIVE"
                  ? "Confirm Deactivation"
                  : "Confirm Reactivation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: AssignClassTeacherDialog
// -----------------------------------------------------------------------------

function AssignClassTeacherDialog({
  staffId,
  open,
  onClose,
  onAssigned,
}: {
  staffId: string;
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();

  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const yearsQuery = useSchoolList<StaffAcademicYear>(
    "/academic-years",
    { limit: 100 },
    { enabled: open },
  );
  const classesQuery = useSchoolList<AcademicClass>(
    "/classes",
    { academicYearId: academicYearId || undefined, limit: 100 },
    { enabled: open && Boolean(academicYearId) },
  );
  const streamsQuery = useSchoolList<ClassStream>(
    "/streams",
    { classId: classId || undefined, limit: 100 },
    { enabled: open && Boolean(classId) },
  );

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(`/schools/${school.id}/staff/${staffId}/class-assignments`, {
        method: "POST",
        body: {
          classId,
          ...(streamId ? { streamId } : {}),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, `/staff/${staffId}/assignments`],
      });
      onAssigned();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to assign class.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!academicYearId || !classId) {
      setFormError("Please select an academic year and class.");
      return;
    }
    assignMutation.mutate();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Assign Class Teacher</DialogTitle>
            <DialogDescription>
              Assign this staff member as a class teacher or stream tutor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="staff-class-year">
                Academic Year <span className="text-destructive">*</span>
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id="staff-class-year"
                onChange={(e) => {
                  setAcademicYearId(e.target.value);
                  setClassId("");
                  setStreamId("");
                }}
                required
                value={academicYearId}
              >
                <option value="">Select an academic year...</option>
                {yearsQuery.data?.data
                  .filter((year) => year.status === "ACTIVE")
                  .map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="staff-class-select">
                Class <span className="text-destructive">*</span>
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!academicYearId}
                id="staff-class-select"
                onChange={(e) => {
                  setClassId(e.target.value);
                  setStreamId("");
                }}
                required
                value={classId}
              >
                <option value="">Select a class...</option>
                {classesQuery.data?.data
                  .filter((c) => c.status === "ACTIVE")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="staff-stream-select">
                Stream / Section (Optional)
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!classId}
                id="staff-stream-select"
                onChange={(e) => setStreamId(e.target.value)}
                value={streamId}
              >
                <option value="">
                  {!classId
                    ? "Select a class first"
                    : streamsQuery.data?.data.length === 0
                      ? "No streams configured"
                      : "Whole Class (All streams)"}
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
            <Button disabled={assignMutation.isPending} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={assignMutation.isPending} type="submit">
              {assignMutation.isPending ? "Assigning..." : "Assign Class"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: AssignSubjectTeacherDialog
// -----------------------------------------------------------------------------

function AssignSubjectTeacherDialog({
  staffId,
  open,
  onClose,
  onAssigned,
}: {
  staffId: string;
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();

  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [classSubjectAssignmentId, setClassSubjectAssignmentId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const yearsQuery = useSchoolList<StaffAcademicYear>(
    "/academic-years",
    { limit: 100 },
    { enabled: open },
  );
  const classesQuery = useSchoolList<AcademicClass>(
    "/classes",
    { academicYearId: academicYearId || undefined, limit: 100 },
    { enabled: open && Boolean(academicYearId) },
  );
  const subjectsQuery = useSchoolList<SubjectRecord>("/subjects", { limit: 100 }, { enabled: open });
  const classSubjectsQuery = useSchoolList<ClassSubjectRecord>(
    "/class-subjects",
    { classId: classId || undefined, limit: 100 },
    { enabled: open && Boolean(classId) },
  );

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(`/schools/${school.id}/staff/${staffId}/subject-assignments`, {
        method: "POST",
        body: { classSubjectAssignmentId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, `/staff/${staffId}/assignments`],
      });
      onAssigned();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to assign subject.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!academicYearId || !classId || !classSubjectAssignmentId) {
      setFormError("Please select an academic year, class, and subject offering.");
      return;
    }
    assignMutation.mutate();
  };

  const getOptionLabel = (cs: ClassSubjectRecord) => {
    const className = classesQuery.data?.data.find((c) => c.id === cs.classId)?.name ?? "Class";
    const subjectName = subjectsQuery.data?.data.find((s) => s.id === cs.subjectId)?.name ?? "Subject";
    return `${className} — ${subjectName}`;
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Assign Subject Teacher</DialogTitle>
            <DialogDescription>
              Assign this teacher to an active subject offering in a class.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="staff-subject-year">
                Academic Year <span className="text-destructive">*</span>
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id="staff-subject-year"
                onChange={(e) => {
                  setAcademicYearId(e.target.value);
                  setClassId("");
                  setClassSubjectAssignmentId("");
                }}
                required
                value={academicYearId}
              >
                <option value="">Select an academic year...</option>
                {yearsQuery.data?.data
                  .filter((year) => year.status === "ACTIVE")
                  .map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="staff-subject-class">
                Class <span className="text-destructive">*</span>
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!academicYearId}
                id="staff-subject-class"
                onChange={(e) => {
                  setClassId(e.target.value);
                  setClassSubjectAssignmentId("");
                }}
                required
                value={classId}
              >
                <option value="">Select a class...</option>
                {classesQuery.data?.data
                  .filter((academicClass) => academicClass.status === "ACTIVE")
                  .map((academicClass) => (
                    <option key={academicClass.id} value={academicClass.id}>
                      {academicClass.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="staff-subject-offering">
                Class & Subject Offering <span className="text-destructive">*</span>
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!classId}
                id="staff-subject-offering"
                onChange={(e) => setClassSubjectAssignmentId(e.target.value)}
                required
                value={classSubjectAssignmentId}
              >
                <option value="">Select Class & Subject...</option>
                {classSubjectsQuery.data?.data
                  .filter((cs) => cs.status === "ACTIVE")
                  .map((cs) => (
                    <option key={cs.id} value={cs.id}>
                      {getOptionLabel(cs)}
                    </option>
                  ))}
              </select>
            </div>
            {classSubjectsQuery.data?.data.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No active class-subject pairings found. Configure class subjects in the Academics workspace first.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button disabled={assignMutation.isPending} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={assignMutation.isPending} type="submit">
              {assignMutation.isPending ? "Assigning..." : "Assign Subject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: StartEmploymentDialog
// -----------------------------------------------------------------------------

function StartEmploymentDialog({
  staffId,
  open,
  onClose,
  onStarted,
}: {
  staffId: string;
  open: boolean;
  onClose: () => void;
  onStarted: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const formId = useId();

  const [positionTitle, setPositionTitle] = useState("");
  const [startsOn, setStartsOn] = useState(new Date().toISOString().slice(0, 10));
  const [formError, setFormError] = useState<string | null>(null);

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(`/schools/${school.id}/staff/${staffId}/employments`, {
        method: "POST",
        body: {
          positionTitle: positionTitle.trim(),
          startsOn,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, `/staff/${staffId}/employments`],
      });
      onStarted();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to record employment stint.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!positionTitle.trim() || !startsOn) {
      setFormError("Position title and start date are required.");
      return;
    }
    startMutation.mutate();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Record Employment Stint</DialogTitle>
            <DialogDescription>
              Start a new employment episode or promotion for this staff member.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-position-title`}
              >
                Position Title <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-position-title`}
                onChange={(e) => setPositionTitle(e.target.value)}
                placeholder="e.g. Senior Teacher"
                required
                value={positionTitle}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-start-date`}
              >
                Start Date <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-start-date`}
                onChange={(e) => setStartsOn(e.target.value)}
                required
                type="date"
                value={startsOn}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button disabled={startMutation.isPending} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={startMutation.isPending} type="submit">
              {startMutation.isPending ? "Starting..." : "Record Stint"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: EndEmploymentDialog
// -----------------------------------------------------------------------------

function EndEmploymentDialog({
  staffId,
  employmentId,
  open,
  onClose,
  onEnded,
}: {
  staffId: string;
  employmentId: string;
  open: boolean;
  onClose: () => void;
  onEnded: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const formId = useId();

  const [endsOn, setEndsOn] = useState(new Date().toISOString().slice(0, 10));
  const [formError, setFormError] = useState<string | null>(null);

  const endMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(
        `/schools/${school.id}/staff/${staffId}/employments/${employmentId}/end`,
        {
          method: "POST",
          body: { endsOn },
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, `/staff/${staffId}/employments`],
      });
      onEnded();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to end employment episode.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!endsOn) {
      setFormError("End date is required.");
      return;
    }
    endMutation.mutate();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>End Employment Episode</DialogTitle>
            <DialogDescription>
              Mark the effective conclusion date of this employment stint.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-end-date`}
              >
                End Date <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-end-date`}
                onChange={(e) => setEndsOn(e.target.value)}
                required
                type="date"
                value={endsOn}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button disabled={endMutation.isPending} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={endMutation.isPending} type="submit" variant="outline">
              {endMutation.isPending ? "Ending..." : "Confirm End Date"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: CreateDepartmentDialog
// -----------------------------------------------------------------------------

function CreateDepartmentDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const formId = useId();

  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(`/schools/${school.id}/departments`, {
        method: "POST",
        body: { name: name.trim() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/departments"],
      });
      setName("");
      onCreated();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to create department.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Department name is required.");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Department</DialogTitle>
            <DialogDescription>
              Create an academic or operational department (e.g. Sciences, Languages, Administration).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-department-name`}
              >
                Department Name <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-department-name`}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Science & Mathematics"
                required
                value={name}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button disabled={createMutation.isPending} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={createMutation.isPending} type="submit">
              {createMutation.isPending ? "Creating..." : "Create Department"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: EditDepartmentDialog
// -----------------------------------------------------------------------------

function EditDepartmentDialog({
  department,
  open,
  onClose,
  onUpdated,
}: {
  department: StaffDepartmentRecord;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const formId = useId();

  const [name, setName] = useState(department.name);
  const [formError, setFormError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(`/schools/${school.id}/departments/${department.id}`, {
        method: "PATCH",
        body: { name: name.trim() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/departments"],
      });
      onUpdated();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to update department.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Department name is required.");
      return;
    }
    updateMutation.mutate();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Department</DialogTitle>
            <DialogDescription>
              Rename <strong>{department.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`${formId}-department-name`}
              >
                Department Name
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id={`${formId}-department-name`}
                onChange={(e) => setName(e.target.value)}
                required
                value={name}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button disabled={updateMutation.isPending} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={updateMutation.isPending} type="submit">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: DeactivateDepartmentDialog
// -----------------------------------------------------------------------------

function DeactivateDepartmentDialog({
  department,
  open,
  onClose,
  onDeactivated,
}: {
  department: StaffDepartmentRecord;
  open: boolean;
  onClose: () => void;
  onDeactivated: () => void;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(`/schools/${school.id}/departments/${department.id}/deactivate`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/departments"],
      });
      onDeactivated();
    },
    onError: (err) => {
      setFormError(
        err instanceof Error
          ? err.message
          : "Failed to deactivate department. Ensure all active staff are reassigned first.",
      );
    },
  });

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate Department</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate <strong>{department.name}</strong>?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {formError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
            <strong>Safeguard:</strong> You cannot deactivate a department if active staff members are currently assigned to it.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button disabled={deactivateMutation.isPending} onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:opacity-90"
            disabled={deactivateMutation.isPending}
            onClick={() => {
              setFormError(null);
              deactivateMutation.mutate();
            }}
          >
            {deactivateMutation.isPending ? "Deactivating..." : "Confirm Deactivation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
