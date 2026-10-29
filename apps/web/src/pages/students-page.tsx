import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Edit2,
  GraduationCap,
  History,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useAuth } from "@/app/auth-provider";
import { RequestError, RequestLoading } from "@/components/api/request-state";
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
import { useSchoolData, useSchoolList } from "@/lib/api/school-data";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type StudentStatus = "ACTIVE" | "TRANSFERRED" | "GRADUATED" | "WITHDRAWN";

export type Student = {
  id: string;
  admissionNumber: string;
  admissionYearId: string;
  admissionApplicationId: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  dateOfBirth: string | null;
  status: StudentStatus;
  createdAt: string;
  updatedAt: string;
};

export type StudentPlacement = {
  id: string;
  studentId: string;
  academicYearId: string;
  classId: string;
  streamId: string | null;
  startedAt: string;
  endedAt: string | null;
};

export type GuardianRecord = {
  id: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StudentGuardianRecord = {
  id: string;
  studentId: string;
  guardianId: string;
  relationship: string;
  authorizedAccess: boolean;
  guardian: GuardianRecord;
};

export type ProfileRevisionRecord = {
  id: string;
  studentId?: string;
  guardianId?: string;
  givenName: string;
  middleName: string | null;
  familyName: string;
  dateOfBirth?: string | null;
  email?: string | null;
  phone?: string | null;
  recordedAt: string;
};

const studentStatusStyles: Record<StudentStatus, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  TRANSFERRED: { label: "Transferred", className: "bg-amber-50 text-amber-700 border-amber-200" },
  GRADUATED: { label: "Graduated", className: "bg-blue-50 text-blue-700 border-blue-200" },
  WITHDRAWN: { label: "Withdrawn", className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
};

function StudentStatusBadge({ status }: { status: StudentStatus }) {
  const config = studentStatusStyles[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Main Students & Guardians Page
// -----------------------------------------------------------------------------

export function StudentsPage() {
  const { school } = useAuth();
  const permissions = new Set(school?.permissions ?? []);
  const canReadStudents = permissions.has("students.profile.read");
  const canReadGuardians = permissions.has("guardians.profile.read");
  const canManageGuardians = permissions.has("guardians.profile.manage");
  const canAdmitStudent =
    permissions.has("admissions.application.read") &&
    permissions.has("admissions.application.admit");
  const [studentPageSize, setStudentPageSize] = useState(25);
  const [guardianPageSize, setGuardianPageSize] = useState(25);
  const [activeTab, setActiveTab] = useState<"students" | "guardians">(
    canReadStudents ? "students" : "guardians",
  );

  // Students state
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState("all");
  const [studentOffset, setStudentOffset] = useState(0);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Guardians state
  const [guardianSearch, setGuardianSearch] = useState("");
  const [guardianOffset, setGuardianOffset] = useState(0);
  const [selectedGuardianId, setSelectedGuardianId] = useState<string | null>(null);
  const [isCreateGuardianOpen, setIsCreateGuardianOpen] = useState(false);

  // Queries
  const students = useSchoolList<Student>(
    "/students",
    {
      limit: studentPageSize,
      offset: studentOffset,
      q: studentSearch.trim() || undefined,
      status: studentStatusFilter === "all" ? undefined : studentStatusFilter,
      sortBy: "admissionNumber",
      sortOrder: "asc",
    },
    { enabled: canReadStudents },
  );

  const guardians = useSchoolList<GuardianRecord>(
    "/guardians",
    {
      limit: guardianPageSize,
      offset: guardianOffset,
      q: guardianSearch.trim() || undefined,
      sortBy: "familyName",
      sortOrder: "asc",
    },
    { enabled: canReadGuardians },
  );

  const selectedStudent = students.data?.data.find((s) => s.id === selectedStudentId);
  const selectedGuardian = guardians.data?.data.find((g) => g.id === selectedGuardianId);

  if (!canReadStudents && !canReadGuardians) {
    return (
      <UnauthorizedState
        description="Your school access does not include permission to read student or guardian records."
        title="Student records access unavailable"
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          activeTab === "students" && canAdmitStudent ? (
            <Button asChild className="gap-2">
              <Link to="/admissions">
                <UserPlus className="size-4" />
                Admit New Student
              </Link>
            </Button>
          ) : activeTab === "guardians" && canManageGuardians ? (
            <Button className="gap-2" onClick={() => setIsCreateGuardianOpen(true)}>
              <Plus className="size-4" />
              New Guardian
            </Button>
          ) : undefined
        }
        description="Manage enrolled students, academic placements, and guardian directory relationships."
        eyebrow={<p className="text-sm font-medium text-primary">Learner & Family Records</p>}
        title="Students & Guardians"
      />

      {/* Tabs */}
      <div className="border-b">
        <fieldset className="flex space-x-8 border-0 p-0">
          <legend className="sr-only">Student record views</legend>
          {canReadStudents && (
            <button
              aria-pressed={activeTab === "students"}
              className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === "students"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground"
              }`}
              onClick={() => setActiveTab("students")}
              type="button"
            >
              <GraduationCap className="size-4" />
              Students Directory
              {students.isError ? (
                <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">Unavailable</span>
              ) : students.data ? (
                <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {students.data.meta.total}
                </span>
              ) : null}
            </button>
          )}

          {canReadGuardians && (
            <button
              aria-pressed={activeTab === "guardians"}
              className={`border-b-2 py-4 px-1 text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === "guardians"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground"
              }`}
              onClick={() => setActiveTab("guardians")}
              type="button"
            >
              <Users className="size-4" />
              Guardians Directory
              {guardians.isError ? (
                <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">Unavailable</span>
              ) : guardians.data ? (
                <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                  {guardians.data.meta.total}
                </span>
              ) : null}
            </button>
          )}
        </fieldset>
      </div>

      {/* Tab 1: Students */}
      {activeTab === "students" && canReadStudents && (
        <section aria-labelledby="student-records-heading" className="space-y-4">
          <Card className="shadow-none">
            <CardContent className="space-y-5 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="relative block">
                  <span className="sr-only">Search by student name or admission number</span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => {
                      setStudentSearch(event.target.value);
                      setStudentOffset(0);
                      setStudentPageSize(25);
                    }}
                    placeholder="Name or admission number"
                    type="search"
                    value={studentSearch}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Student status</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => {
                      setStudentStatusFilter(event.target.value);
                      setStudentOffset(0);
                      setStudentPageSize(25);
                    }}
                    value={studentStatusFilter}
                  >
                    <option value="all">All statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="TRANSFERRED">Transferred</option>
                    <option value="GRADUATED">Graduated</option>
                    <option value="WITHDRAWN">Withdrawn</option>
                  </select>
                </label>
              </div>

              <div aria-live="polite" className="overflow-hidden rounded-lg border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] border-collapse text-left text-sm">
                    <caption className="sr-only">Student records</caption>
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Admission number
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Student name
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Date of birth
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Enrolled date
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
                      {students.isPending ? (
                        <tr>
                          <td colSpan={6}>
                            <RequestLoading />
                          </td>
                        </tr>
                      ) : students.isError ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="space-y-3 p-4">
                              <RequestError error={students.error} />
                              <Button
                                disabled={students.isFetching}
                                onClick={() => void students.refetch()}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Retry loading students
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : students.data.data.length === 0 ? (
                        <tr>
                          <td
                            className="px-4 py-12 text-center text-sm text-muted-foreground"
                            colSpan={6}
                          >
                            No student records found. Learners are created when an admission
                            application is approved and admitted.
                          </td>
                        </tr>
                      ) : (
                        students.data.data.map((student) => {
                          const fullName = [
                            student.givenName,
                            student.middleName,
                            student.familyName,
                          ]
                            .filter(Boolean)
                            .join(" ");

                          return (
                            <tr
                              className="border-t transition-colors hover:bg-muted/40"
                              key={student.id}
                            >
                              <td className="px-4 py-3 font-mono font-medium text-foreground">
                                {student.admissionNumber}
                              </td>
                              <td className="px-4 py-3 font-medium">
                                <button
                                  className="rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() => setSelectedStudentId(student.id)}
                                  type="button"
                                >
                                  {fullName}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {student.dateOfBirth ? student.dateOfBirth : "—"}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {new Date(student.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3">
                                <StudentStatusBadge status={student.status} />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  onClick={() => setSelectedStudentId(student.id)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  Manage
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

              {!students.isError && !students.isPending && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p aria-live="polite" className="text-xs text-muted-foreground">
                    Showing{" "}
                    {students.data.meta.total === 0 ? 0 : students.data.meta.offset + 1}–
                    {students.data.meta.offset + students.data.data.length} of{" "}
                    {students.data.meta.total}{" "}
                    students.
                  </p>
                  <nav aria-label="Student pages" className="flex items-center gap-2">
                    <Button
                      disabled={students.data.meta.offset === 0 || students.isFetching}
                      onClick={() => {
                        setStudentPageSize(students.data.meta.limit);
                        setStudentOffset(
                          Math.max(0, students.data.meta.offset - students.data.meta.limit),
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
                      {Math.floor(students.data.meta.offset / students.data.meta.limit) + 1} of{" "}
                      {Math.max(
                        1,
                        Math.ceil(students.data.meta.total / students.data.meta.limit),
                      )}
                    </span>
                    <Button
                      disabled={
                        students.data.meta.offset + students.data.data.length >=
                          students.data.meta.total || students.isFetching
                      }
                      onClick={() => {
                        setStudentPageSize(students.data.meta.limit);
                        setStudentOffset(students.data.meta.offset + students.data.meta.limit);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Next
                    </Button>
                  </nav>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Tab 2: Guardians Directory */}
      {activeTab === "guardians" && canReadGuardians && (
        <section aria-labelledby="guardian-records-heading" className="space-y-4">
          <Card className="shadow-none">
            <CardContent className="space-y-5 p-4 sm:p-5">
              <div className="max-w-md">
                <label className="relative block">
                  <span className="sr-only">Search guardians</span>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) => {
                      setGuardianSearch(event.target.value);
                      setGuardianOffset(0);
                      setGuardianPageSize(25);
                    }}
                    placeholder="Search by name, phone, or email"
                    type="search"
                    value={guardianSearch}
                  />
                </label>
              </div>

              <div aria-live="polite" className="overflow-hidden rounded-lg border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                    <caption className="sr-only">Guardians directory</caption>
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Guardian name
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Phone
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Email
                        </th>
                        <th className="px-4 py-3 font-medium" scope="col">
                          Recorded date
                        </th>
                        <th className="px-4 py-3 text-right font-medium" scope="col">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {guardians.isPending ? (
                        <tr>
                          <td colSpan={5}>
                            <RequestLoading />
                          </td>
                        </tr>
                      ) : guardians.isError ? (
                        <tr>
                          <td colSpan={5}>
                            <div className="space-y-3 p-4">
                              <RequestError error={guardians.error} />
                              <Button
                                disabled={guardians.isFetching}
                                onClick={() => void guardians.refetch()}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Retry loading guardians
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : guardians.data.data.length === 0 ? (
                        <tr>
                          <td
                            className="px-4 py-12 text-center text-sm text-muted-foreground"
                            colSpan={5}
                          >
                            No guardian records found.
                          </td>
                        </tr>
                      ) : (
                        guardians.data.data.map((guardian) => {
                          const fullName = [
                            guardian.givenName,
                            guardian.middleName,
                            guardian.familyName,
                          ]
                            .filter(Boolean)
                            .join(" ");

                          return (
                            <tr
                              className="border-t transition-colors hover:bg-muted/40"
                              key={guardian.id}
                            >
                              <td className="px-4 py-3 font-medium text-foreground">
                                <button
                                  className="rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() => setSelectedGuardianId(guardian.id)}
                                  type="button"
                                >
                                  {fullName}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {guardian.phone || "—"}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {guardian.email || "—"}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {new Date(guardian.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  onClick={() => setSelectedGuardianId(guardian.id)}
                                  size="sm"
                                  variant="ghost"
                                >
                                  {canManageGuardians ? "View / Edit" : "View"}
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

              {!guardians.isError && !guardians.isPending && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p aria-live="polite" className="text-xs text-muted-foreground">
                    Showing{" "}
                    {guardians.data.meta.total === 0 ? 0 : guardians.data.meta.offset + 1}–
                    {guardians.data.meta.offset + guardians.data.data.length} of{" "}
                    {guardians.data.meta.total}{" "}
                    guardians.
                  </p>
                  <nav aria-label="Guardian pages" className="flex items-center gap-2">
                    <Button
                      disabled={guardians.data.meta.offset === 0 || guardians.isFetching}
                      onClick={() => {
                        setGuardianPageSize(guardians.data.meta.limit);
                        setGuardianOffset(
                          Math.max(0, guardians.data.meta.offset - guardians.data.meta.limit),
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
                      {Math.floor(guardians.data.meta.offset / guardians.data.meta.limit) + 1} of{" "}
                      {Math.max(
                        1,
                        Math.ceil(guardians.data.meta.total / guardians.data.meta.limit),
                      )}
                    </span>
                    <Button
                      disabled={
                        guardians.data.meta.offset + guardians.data.data.length >=
                          guardians.data.meta.total || guardians.isFetching
                      }
                      onClick={() => {
                        setGuardianPageSize(guardians.data.meta.limit);
                        setGuardianOffset(
                          guardians.data.meta.offset + guardians.data.meta.limit,
                        );
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Next
                    </Button>
                  </nav>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Student Detail & Management Sheet */}
      {selectedStudent && (
        <StudentDetailSheet
          canChangeStatus={permissions.has("students.profile.status")}
          canManageGuardianLinks={permissions.has("students.guardian.manage")}
          canReadGuardians={canReadGuardians}
          canUpdateProfile={permissions.has("students.profile.update")}
          onClose={() => setSelectedStudentId(null)}
          open={Boolean(selectedStudentId)}
          student={selectedStudent}
        />
      )}

      {/* Guardian Detail & Edit Sheet */}
      {selectedGuardian && (
        <GuardianDetailSheet
          canManage={canManageGuardians}
          guardian={selectedGuardian}
          onClose={() => setSelectedGuardianId(null)}
          open={Boolean(selectedGuardianId)}
        />
      )}

      {/* Create Guardian Sheet */}
      <CreateGuardianSheet
        onClose={() => setIsCreateGuardianOpen(false)}
        onCreated={(id) => {
          setIsCreateGuardianOpen(false);
          setSelectedGuardianId(id);
        }}
        open={isCreateGuardianOpen && canManageGuardians}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Component: StudentDetailSheet
// -----------------------------------------------------------------------------

function StudentDetailSheet({
  student,
  open,
  onClose,
  canUpdateProfile,
  canChangeStatus,
  canManageGuardianLinks,
  canReadGuardians,
}: {
  student: Student;
  open: boolean;
  onClose: () => void;
  canUpdateProfile: boolean;
  canChangeStatus: boolean;
  canManageGuardianLinks: boolean;
  canReadGuardians: boolean;
}) {
  // Dialog triggers
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isLinkGuardianOpen, setIsLinkGuardianOpen] = useState(false);
  const [editingGuardianLink, setEditingGuardianLink] = useState<StudentGuardianRecord | null>(
    null,
  );

  // Queries for related student data
  const placementsQuery = useSchoolData<StudentPlacement[]>(
    `/students/${student.id}/placements`,
    {},
    { enabled: open },
  );

  const guardiansQuery = useSchoolData<StudentGuardianRecord[]>(
    `/students/${student.id}/guardians`,
    {},
    { enabled: open && canReadGuardians },
  );

  const historyQuery = useSchoolData<{ data: ProfileRevisionRecord[] }>(
    `/students/${student.id}/profile-history`,
    { limit: 10 },
    { enabled: open },
  );

  const fullName = [student.givenName, student.middleName, student.familyName]
    .filter(Boolean)
    .join(" ");

  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between pr-4">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Admission #{student.admissionNumber}
            </span>
            <StudentStatusBadge status={student.status} />
          </div>
          <SheetTitle className="text-xl">{fullName}</SheetTitle>
          <SheetDescription>
            Enrolled on {new Date(student.createdAt).toLocaleDateString()}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Action Row */}
          <div className="flex flex-wrap gap-2">
            {canUpdateProfile && (
              <Button
                className="gap-1.5"
                onClick={() => setIsEditProfileOpen(true)}
                size="sm"
                variant="outline"
              >
                <Edit2 className="size-3.5" />
                Edit Profile
              </Button>
            )}
            {student.status === "ACTIVE" && canChangeStatus && (
              <Button
                className="gap-1.5 text-amber-700 hover:text-amber-800"
                onClick={() => setIsStatusDialogOpen(true)}
                size="sm"
                variant="outline"
              >
                Change Status
              </Button>
            )}
          </div>

          {/* Profile Overview */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Personal Information
            </h4>
            <div className="rounded-lg border bg-card p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Admission Number:</span>
                <span className="font-mono font-medium">{student.admissionNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Full Name:</span>
                <span className="font-medium">{fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date of Birth:</span>
                <span>{student.dateOfBirth ? student.dateOfBirth : "Not recorded"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <StudentStatusBadge status={student.status} />
              </div>
            </div>
          </div>

          {/* Placements History */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Academic Placements</span>
            </h4>
            {placementsQuery.isPending ? (
              <RequestLoading />
            ) : placementsQuery.isError ? (
              <div className="space-y-3">
                <RequestError error={placementsQuery.error} />
                <Button
                  disabled={placementsQuery.isFetching}
                  onClick={() => void placementsQuery.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Retry loading academic placements
                </Button>
              </div>
            ) : placementsQuery.data?.length === 0 ? (
              <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                No class placements recorded for this student.
              </div>
            ) : (
              <div className="space-y-2">
                {placementsQuery.data?.map((placement) => (
                  <section
                    key={placement.id}
                    className="space-y-3 rounded-lg border bg-card p-3 text-sm"
                    aria-labelledby={`placement-${placement.id}-heading`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h5 className="font-medium" id={`placement-${placement.id}-heading`}>
                        {placement.endedAt ? "Previous placement" : "Current placement"}
                      </h5>
                      <Badge variant={placement.endedAt ? "outline" : "default"}>
                        {placement.endedAt ? "Historical" : "Active"}
                      </Badge>
                    </div>
                    <dl className="grid gap-3 text-xs sm:grid-cols-2">
                      <div className="space-y-1">
                        <dt className="text-muted-foreground">Started</dt>
                        <dd className="font-medium text-foreground">
                          {new Date(placement.startedAt).toLocaleDateString()}
                        </dd>
                      </div>
                      <div className="space-y-1">
                        <dt className="text-muted-foreground">Ended</dt>
                        <dd className="font-medium text-foreground">
                          {placement.endedAt
                            ? new Date(placement.endedAt).toLocaleDateString()
                            : "Not ended"}
                        </dd>
                      </div>
                    </dl>
                    <p className="text-xs text-muted-foreground">
                      Class, stream, and academic-year names are not included in this placement
                      record.
                    </p>
                  </section>
                ))}
              </div>
            )}
          </div>

          {/* Linked Guardians */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Linked Guardians
              </h4>
              {canManageGuardianLinks && canReadGuardians && (
                <Button
                  className="gap-1 text-xs h-7"
                  onClick={() => setIsLinkGuardianOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <Plus className="size-3" />
                  Link Guardian
                </Button>
              )}
            </div>

            {!canReadGuardians ? (
              <p className="rounded-lg border p-3 text-xs text-muted-foreground">
                Guardian details require guardian-profile read permission.
              </p>
            ) : guardiansQuery.isPending ? (
              <RequestLoading />
            ) : guardiansQuery.isError ? (
              <div className="space-y-3">
                <RequestError error={guardiansQuery.error} />
                <Button
                  disabled={guardiansQuery.isFetching}
                  onClick={() => void guardiansQuery.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Retry loading linked guardians
                </Button>
              </div>
            ) : guardiansQuery.data?.length === 0 ? (
              <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                No guardians linked to this student yet.
              </div>
            ) : (
              <div className="space-y-2">
                {guardiansQuery.data?.map((item) => {
                  const g = item.guardian;
                  const guardianName = [g.givenName, g.middleName, g.familyName]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div key={item.id} className="rounded-lg border bg-card p-3 text-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-foreground">{guardianName}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({item.relationship})
                          </span>
                        </div>
                        {canManageGuardianLinks && (
                          <Button
                            className="h-6 px-2 text-xs"
                            onClick={() => setEditingGuardianLink(item)}
                            size="sm"
                            variant="ghost"
                          >
                            Edit
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {g.phone && <span>Phone: {g.phone}</span>}
                        {g.email && <span>Email: {g.email}</span>}
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px]">
                        {item.authorizedAccess ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <Shield className="size-3" />
                            Authorized Contact
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <ShieldAlert className="size-3" />
                            Unauthorized for direct release
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Profile Revision Audit */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <History className="size-3.5" />
              Profile Revision History
            </h4>
            {historyQuery.isPending ? (
              <RequestLoading />
            ) : historyQuery.isError ? (
              <div className="space-y-3">
                <RequestError error={historyQuery.error} />
                <Button
                  disabled={historyQuery.isFetching}
                  onClick={() => void historyQuery.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Retry loading profile history
                </Button>
              </div>
            ) : historyQuery.data.data.length === 0 ? (
              <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                No profile revisions recorded for this student.
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-xs">
                {historyQuery.data.data.map((revision) => (
                  <div
                    key={revision.id}
                    className="border-b last:border-b-0 pb-2 last:pb-0 space-y-0.5"
                  >
                    <div className="text-muted-foreground">
                      Recorded on {new Date(revision.recordedAt).toLocaleString()}:
                    </div>
                    <div className="font-medium text-foreground">
                      {[revision.givenName, revision.middleName, revision.familyName]
                        .filter(Boolean)
                        .join(" ")}
                      {revision.dateOfBirth && ` • DOB: ${revision.dateOfBirth}`}
                    </div>
                  </div>
                ))}
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

      {/* Edit Student Profile Modal */}
      <EditStudentProfileDialog
        canUpdateProfile={canUpdateProfile}
        onClose={() => setIsEditProfileOpen(false)}
        onSaved={() => setIsEditProfileOpen(false)}
        open={isEditProfileOpen}
        student={student}
      />

      {/* Change Student Status Modal */}
      <ChangeStudentStatusDialog
        canChangeStatus={canChangeStatus}
        onClose={() => setIsStatusDialogOpen(false)}
        onSaved={() => {
          setIsStatusDialogOpen(false);
          onClose();
        }}
        open={isStatusDialogOpen}
        student={student}
      />

      {/* Link Guardian Modal */}
      <LinkGuardianDialog
        canManage={canManageGuardianLinks && canReadGuardians}
        onClose={() => setIsLinkGuardianOpen(false)}
        onLinked={() => setIsLinkGuardianOpen(false)}
        open={isLinkGuardianOpen}
        studentId={student.id}
      />

      {/* Update Student-Guardian Relationship Modal */}
      {editingGuardianLink && (
        <UpdateStudentGuardianDialog
          link={editingGuardianLink}
          onClose={() => setEditingGuardianLink(null)}
          onUpdated={() => setEditingGuardianLink(null)}
          canManage={canManageGuardianLinks}
          open={Boolean(editingGuardianLink)}
          studentId={student.id}
        />
      )}
    </Sheet>
  );
}

// -----------------------------------------------------------------------------
// Component: EditStudentProfileDialog
// -----------------------------------------------------------------------------

function EditStudentProfileDialog({
  student,
  open,
  onClose,
  onSaved,
  canUpdateProfile,
}: {
  student: Student;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  canUpdateProfile: boolean;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();

  const [givenName, setGivenName] = useState(student.givenName);
  const [middleName, setMiddleName] = useState(student.middleName ?? "");
  const [familyName, setFamilyName] = useState(student.familyName);
  const [dateOfBirth, setDateOfBirth] = useState(student.dateOfBirth ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");

      const payload = {
        givenName: givenName.trim() || undefined,
        middleName: middleName.trim() || null,
        familyName: familyName.trim() || undefined,
        dateOfBirth: dateOfBirth || null,
      };

      return apiRequest(`/schools/${school.id}/students/${student.id}`, {
        method: "PATCH",
        body: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/students"],
      });
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, `/students/${student.id}/profile-history`],
      });
      onSaved();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to update student profile.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUpdateProfile) return;
    setFormError(null);
    if (!givenName.trim() || !familyName.trim()) {
      setFormError("Given name and family name are required.");
      return;
    }
    editMutation.mutate();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Student Profile</DialogTitle>
            <DialogDescription>
              Changes are versioned and logged in the profile audit history.
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
                htmlFor="student-given-name"
              >
                Given name <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canUpdateProfile}
                id="student-given-name"
                onChange={(e) => setGivenName(e.target.value)}
                required
                value={givenName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="student-middle-name"
              >
                Middle name
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canUpdateProfile}
                id="student-middle-name"
                onChange={(e) => setMiddleName(e.target.value)}
                value={middleName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="student-family-name"
              >
                Family name <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canUpdateProfile}
                id="student-family-name"
                onChange={(e) => setFamilyName(e.target.value)}
                required
                value={familyName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="student-date-of-birth"
              >
                Date of birth
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canUpdateProfile}
                id="student-date-of-birth"
                onChange={(e) => setDateOfBirth(e.target.value)}
                type="date"
                value={dateOfBirth}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              disabled={editMutation.isPending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            {canUpdateProfile && (
              <Button disabled={editMutation.isPending} type="submit">
                {editMutation.isPending ? "Saving..." : "Save Profile"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: ChangeStudentStatusDialog
// -----------------------------------------------------------------------------

function ChangeStudentStatusDialog({
  student,
  open,
  onClose,
  onSaved,
  canChangeStatus,
}: {
  student: Student;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  canChangeStatus: boolean;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();

  const [newStatus, setNewStatus] = useState<"TRANSFERRED" | "GRADUATED" | "WITHDRAWN">(
    "TRANSFERRED",
  );
  const [formError, setFormError] = useState<string | null>(null);

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(`/schools/${school.id}/students/${student.id}/status`, {
        method: "POST",
        body: { status: newStatus },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/students"],
      });
      onSaved();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to change student status.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canChangeStatus) return;
    setFormError(null);
    statusMutation.mutate();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Update Student Status</DialogTitle>
            <DialogDescription>
              Marking a student as Transferred, Graduated, or Withdrawn transitions them out of
              active enrollment.
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
                htmlFor="student-new-status"
              >
                Select New Status
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canChangeStatus}
                id="student-new-status"
                onChange={(e) =>
                  setNewStatus(e.target.value as "TRANSFERRED" | "GRADUATED" | "WITHDRAWN")
                }
                value={newStatus}
              >
                <option value="TRANSFERRED">Transferred (moved to another school)</option>
                <option value="GRADUATED">Graduated (completed school program)</option>
                <option value="WITHDRAWN">Withdrawn (discontinued enrolment)</option>
              </select>
            </div>

            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
              <strong>Notice:</strong> This status change is permanent and will prevent further
              active attendance and exam registrations for this student.
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              disabled={statusMutation.isPending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            {canChangeStatus && (
              <Button
                className="bg-destructive text-destructive-foreground hover:opacity-90"
                disabled={statusMutation.isPending}
                type="submit"
              >
                {statusMutation.isPending ? "Updating..." : "Confirm Status Change"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: LinkGuardianDialog
// -----------------------------------------------------------------------------

function LinkGuardianDialog({
  studentId,
  open,
  onClose,
  onLinked,
  canManage,
}: {
  studentId: string;
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
  canManage: boolean;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();

  const [guardianId, setGuardianId] = useState("");
  const [relationship, setRelationship] = useState("Parent");
  const [authorizedAccess, setAuthorizedAccess] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Load guardians directory for selection
  const guardiansQuery = useSchoolList<GuardianRecord>(
    "/guardians",
    { limit: 100 },
    { enabled: open && canManage },
  );

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(`/schools/${school.id}/students/${studentId}/guardians`, {
        method: "POST",
        body: {
          guardianId,
          relationship: relationship.trim(),
          authorizedAccess,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, `/students/${studentId}/guardians`],
      });
      onLinked();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to link guardian.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setFormError(null);
    if (!guardianId) {
      setFormError("Please select a guardian from the directory.");
      return;
    }
    if (!relationship.trim()) {
      setFormError("Relationship is required.");
      return;
    }
    linkMutation.mutate();
  };

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Link Guardian to Student</DialogTitle>
            <DialogDescription>
              Select an existing guardian from your school directory to associate with this learner.
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
                htmlFor="link-guardian-id"
              >
                Guardian <span className="text-destructive">*</span>
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canManage}
                id="link-guardian-id"
                onChange={(e) => setGuardianId(e.target.value)}
                required
                value={guardianId}
              >
                <option value="">Choose a guardian...</option>
                {guardiansQuery.data?.data.map((g) => (
                  <option key={g.id} value={g.id}>
                    {[g.givenName, g.familyName].join(" ")} ({g.phone || g.email || "No contact"})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="link-guardian-relationship"
              >
                Relationship <span className="text-destructive">*</span>
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canManage}
                id="link-guardian-relationship"
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

            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input
                checked={authorizedAccess}
                className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
                disabled={!canManage}
                onChange={(e) => setAuthorizedAccess(e.target.checked)}
                type="checkbox"
              />
              <span className="text-xs font-medium text-foreground">
                Authorized Emergency / Release Contact
              </span>
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              disabled={linkMutation.isPending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            {canManage && (
              <Button disabled={linkMutation.isPending} type="submit">
                {linkMutation.isPending ? "Linking..." : "Link Guardian"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: UpdateStudentGuardianDialog
// -----------------------------------------------------------------------------

function UpdateStudentGuardianDialog({
  studentId,
  link,
  open,
  onClose,
  onUpdated,
  canManage,
}: {
  studentId: string;
  link: StudentGuardianRecord;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  canManage: boolean;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();

  const [relationship, setRelationship] = useState(link.relationship);
  const [authorizedAccess, setAuthorizedAccess] = useState(link.authorizedAccess);
  const [formError, setFormError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");
      return apiRequest(
        `/schools/${school.id}/students/${studentId}/guardians/${link.guardianId}`,
        {
          method: "PATCH",
          body: {
            relationship: relationship.trim(),
            authorizedAccess,
          },
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, `/students/${studentId}/guardians`],
      });
      onUpdated();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to update relationship.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setFormError(null);
    if (!relationship.trim()) {
      setFormError("Relationship is required.");
      return;
    }
    updateMutation.mutate();
  };

  const guardianName = [link.guardian.givenName, link.guardian.familyName]
    .filter(Boolean)
    .join(" ");

  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Relationship</DialogTitle>
            <DialogDescription>
              Update relationship details for <strong>{guardianName}</strong>.
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
                htmlFor="update-guardian-relationship"
              >
                Relationship
              </label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canManage}
                id="update-guardian-relationship"
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

            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input
                checked={authorizedAccess}
                className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
                disabled={!canManage}
                onChange={(e) => setAuthorizedAccess(e.target.checked)}
                type="checkbox"
              />
              <span className="text-xs font-medium text-foreground">
                Authorized Emergency / Release Contact
              </span>
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              disabled={updateMutation.isPending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            {canManage && (
              <Button disabled={updateMutation.isPending} type="submit">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Component: GuardianDetailSheet
// -----------------------------------------------------------------------------

function GuardianDetailSheet({
  guardian,
  open,
  onClose,
  canManage,
}: {
  guardian: GuardianRecord;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
}) {
  const { school } = useAuth();
  const queryClient = useQueryClient();

  const [givenName, setGivenName] = useState(guardian.givenName);
  const [middleName, setMiddleName] = useState(guardian.middleName ?? "");
  const [familyName, setFamilyName] = useState(guardian.familyName);
  const [email, setEmail] = useState(guardian.email ?? "");
  const [phone, setPhone] = useState(guardian.phone ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  // History query
  const historyQuery = useSchoolData<{ data: ProfileRevisionRecord[] }>(
    `/guardians/${guardian.id}/profile-history`,
    { limit: 10 },
    { enabled: open },
  );

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");

      const payload = {
        givenName: givenName.trim() || undefined,
        middleName: middleName.trim() || null,
        familyName: familyName.trim() || undefined,
        email: email.trim() || null,
        phone: phone.trim() || null,
      };

      return apiRequest(`/schools/${school.id}/guardians/${guardian.id}`, {
        method: "PATCH",
        body: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/guardians"],
      });
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, `/guardians/${guardian.id}/profile-history`],
      });
      onClose();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to update guardian.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setFormError(null);

    if (!givenName.trim() || !familyName.trim()) {
      setFormError("Given name and family name are required.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setFormError("At least one contact method (email or phone) is required.");
      return;
    }

    updateMutation.mutate();
  };

  const fullName = [guardian.givenName, guardian.middleName, guardian.familyName]
    .filter(Boolean)
    .join(" ");

  return (
    <Sheet onOpenChange={(next) => !next && onClose()} open={open}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          <SheetHeader>
            <SheetTitle>{fullName || "Guardian Profile"}</SheetTitle>
            <SheetDescription>
              {canManage
                ? "View and edit guardian contact records and profile audit history."
                : "View guardian contact records and profile audit history."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 py-6">
            {!canManage && (
              <p className="text-sm text-muted-foreground" role="status">
                Read-only: guardian profile management permission is required to make changes.
              </p>
            )}
            {formError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="guardian-profile-given-name"
              >
                Given name <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canManage}
                id="guardian-profile-given-name"
                onChange={(e) => setGivenName(e.target.value)}
                required
                value={givenName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="guardian-profile-middle-name"
              >
                Middle name
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canManage}
                id="guardian-profile-middle-name"
                onChange={(e) => setMiddleName(e.target.value)}
                value={middleName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="guardian-profile-family-name"
              >
                Family name <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canManage}
                id="guardian-profile-family-name"
                onChange={(e) => setFamilyName(e.target.value)}
                required
                value={familyName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="guardian-profile-phone"
              >
                Phone number
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canManage}
                id="guardian-profile-phone"
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254700000000"
                value={phone}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="guardian-profile-email"
              >
                Email address
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!canManage}
                id="guardian-profile-email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="guardian@example.com"
                type="email"
                value={email}
              />
            </div>

            <div className="space-y-2 pt-4">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <History className="size-3.5" />
                Profile Revisions History
              </h5>
              {historyQuery.isPending ? (
                <RequestLoading />
              ) : historyQuery.isError ? (
                <div className="space-y-3">
                  <RequestError error={historyQuery.error} />
                  <Button
                    disabled={historyQuery.isFetching}
                    onClick={() => void historyQuery.refetch()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Retry loading guardian history
                  </Button>
                </div>
              ) : historyQuery.data.data.length === 0 ? (
                <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                  No profile revisions recorded for this guardian.
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-xs">
                  {historyQuery.data.data.map((revision) => (
                    <div key={revision.id} className="border-b last:border-b-0 pb-1.5 last:pb-0">
                      <div className="text-muted-foreground">
                        {new Date(revision.recordedAt).toLocaleString()}:
                      </div>
                      <div className="font-medium text-foreground">
                        {[revision.givenName, revision.middleName, revision.familyName]
                          .filter(Boolean)
                          .join(" ")}
                        {revision.phone && ` • Phone: ${revision.phone}`}
                        {revision.email && ` • Email: ${revision.email}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <SheetFooter className="border-t pt-4">
            <Button
              disabled={updateMutation.isPending}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            {canManage && (
              <Button disabled={updateMutation.isPending} type="submit">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// -----------------------------------------------------------------------------
// Component: CreateGuardianSheet
// -----------------------------------------------------------------------------

function CreateGuardianSheet({
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

  const [givenName, setGivenName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setGivenName("");
    setMiddleName("");
    setFamilyName("");
    setEmail("");
    setPhone("");
    setFormError(null);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!school?.id) throw new Error("No school selected.");

      const payload = {
        givenName: givenName.trim(),
        middleName: middleName.trim() || null,
        familyName: familyName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      };

      const res = await apiRequest<{ data: GuardianRecord }>(`/schools/${school.id}/guardians`, {
        method: "POST",
        body: payload,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["school-data", school?.id, "/guardians"],
      });
      resetForm();
      onCreated(data.id);
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to create guardian.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!givenName.trim() || !familyName.trim()) {
      setFormError("Given name and family name are required.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setFormError("At least one contact method (email or phone) is required.");
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
            <SheetTitle>New Guardian</SheetTitle>
            <SheetDescription>Add a parent or guardian to the school directory.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 py-6">
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

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="new-guardian-given-name"
              >
                Given name <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id="new-guardian-given-name"
                onChange={(e) => setGivenName(e.target.value)}
                placeholder="e.g. Grace"
                required
                value={givenName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="new-guardian-middle-name"
              >
                Middle name
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id="new-guardian-middle-name"
                onChange={(e) => setMiddleName(e.target.value)}
                placeholder="Optional"
                value={middleName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="new-guardian-family-name"
              >
                Family name <span className="text-destructive">*</span>
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id="new-guardian-family-name"
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="e.g. Otieno"
                required
                value={familyName}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="new-guardian-phone"
              >
                Phone number
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id="new-guardian-phone"
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +254700000000"
                value={phone}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor="new-guardian-email"
              >
                Email address
              </label>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
                id="new-guardian-email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. grace@example.com"
                type="email"
                value={email}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              At least one contact method (phone or email) is required.
            </p>
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
              {createMutation.isPending ? "Creating..." : "Create Guardian"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
