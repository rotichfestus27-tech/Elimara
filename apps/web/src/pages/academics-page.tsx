import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import { useSchoolList } from "@/lib/api/school-data";

export type AcademicRecordStatus = "ACTIVE" | "INACTIVE";

export type AcademicYear = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: AcademicRecordStatus;
};

export type Term = {
  id: string;
  academicYearId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: AcademicRecordStatus;
};

export type AcademicClass = {
  id: string;
  academicYearId: string;
  name: string;
  status: AcademicRecordStatus;
};

export type ClassStream = {
  id: string;
  classId: string;
  name: string;
  status: AcademicRecordStatus;
};

export type Subject = {
  id: string;
  name: string;
  status: AcademicRecordStatus;
};

export type ClassSubject = {
  id: string;
  classId: string;
  subjectId: string;
  status: AcademicRecordStatus;
};

const sections = [
  { id: "academic-years", label: "Academic years" },
  { id: "terms", label: "Terms" },
  { id: "classes", label: "Classes" },
  { id: "streams", label: "Streams" },
  { id: "subjects", label: "Subjects" },
  { id: "class-subjects", label: "Class subjects" },
] as const;

type SectionId = (typeof sections)[number]["id"];

type SheetMode =
  | { type: "create-year" }
  | { type: "edit-year"; record: AcademicYear }
  | { type: "create-term"; defaultYearId: string }
  | { type: "edit-term"; record: Term; year: AcademicYear | undefined }
  | { type: "create-class"; defaultYearId: string }
  | { type: "edit-class"; record: AcademicClass }
  | { type: "create-stream"; defaultClassId: string }
  | { type: "edit-stream"; record: ClassStream }
  | { type: "create-subject" }
  | { type: "edit-subject"; record: Subject }
  | { type: "assign-subject"; defaultClassId: string };

type DeactivateTarget =
  | { type: "academicYears"; id: string; name: string }
  | { type: "terms"; id: string; name: string }
  | { type: "classes"; id: string; name: string }
  | { type: "streams"; id: string; name: string }
  | { type: "subjects"; id: string; name: string }
  | { type: "classSubjects"; id: string; name: string };

function AcademicQueryError({
  error,
  isFetching,
  onRetry,
}: {
  error: Error | null;
  isFetching: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3">
      <RequestError error={error} />
      <Button
        disabled={isFetching}
        onClick={onRetry}
        size="sm"
        type="button"
        variant="outline"
      >
        Retry
      </Button>
    </div>
  );
}

export function AcademicsPage() {
  const { school } = useAuth();
  const queryClient = useQueryClient();
  const canReadConfiguration =
    school?.permissions.includes("academics.configuration.read") ?? false;
  const canManageConfiguration =
    school?.permissions.includes("academics.configuration.manage") ?? false;

  const [section, setSection] = useState<SectionId>("academic-years");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<DeactivateTarget | null>(null);

  // Active academic years for queries and selectors
  const activeYears = useSchoolList<AcademicYear>(
    "/academic-years",
    {
      limit: 100,
      offset: 0,
      status: "ACTIVE",
    },
    { enabled: canReadConfiguration },
  );
  const [selectedYearIdState, setSelectedYearIdState] = useState("");
  const selectedYearId = selectedYearIdState || activeYears.data?.data[0]?.id || "";

  // Active classes for streams and assignments
  const activeClasses = useSchoolList<AcademicClass>(
    "/classes",
    {
      academicYearId: selectedYearId,
      limit: 100,
      offset: 0,
      status: "ACTIVE",
    },
    { enabled: canReadConfiguration && Boolean(selectedYearId) },
  );
  const [selectedClassIdState, setSelectedClassIdState] = useState("");
  const selectedClassId = selectedClassIdState || activeClasses.data?.data[0]?.id || "";

  // Active subjects for subject assignments
  const activeSubjects = useSchoolList<Subject>(
    "/subjects",
    {
      limit: 100,
      offset: 0,
      status: "ACTIVE",
    },
    { enabled: canReadConfiguration },
  );

  // Section queries
  const yearsQuery = useSchoolList<AcademicYear>(
    "/academic-years",
    {
      limit: 100,
      offset: 0,
      status: status === "all" ? undefined : status,
      q: search.trim() || undefined,
    },
    { enabled: canReadConfiguration && section === "academic-years" },
  );

  const termsQuery = useSchoolList<Term>(
    "/terms",
    {
      academicYearId: selectedYearId,
      limit: 100,
      offset: 0,
      status: status === "all" ? undefined : status,
      q: search.trim() || undefined,
    },
    { enabled: canReadConfiguration && section === "terms" && Boolean(selectedYearId) },
  );

  const classesQuery = useSchoolList<AcademicClass>(
    "/classes",
    {
      academicYearId: selectedYearId,
      limit: 100,
      offset: 0,
      status: status === "all" ? undefined : status,
      q: search.trim() || undefined,
    },
    { enabled: canReadConfiguration && section === "classes" && Boolean(selectedYearId) },
  );

  const streamsQuery = useSchoolList<ClassStream>(
    "/streams",
    {
      classId: selectedClassId,
      limit: 100,
      offset: 0,
      status: status === "all" ? undefined : status,
      q: search.trim() || undefined,
    },
    { enabled: canReadConfiguration && section === "streams" && Boolean(selectedClassId) },
  );

  const subjectsQuery = useSchoolList<Subject>(
    "/subjects",
    {
      limit: 100,
      offset: 0,
      status: status === "all" ? undefined : status,
      q: search.trim() || undefined,
    },
    { enabled: canReadConfiguration && section === "subjects" },
  );

  const classSubjectsQuery = useSchoolList<ClassSubject>(
    "/class-subjects",
    {
      classId: selectedClassId,
      limit: 100,
      offset: 0,
      status: status === "all" ? undefined : status,
      q: search.trim() || undefined,
    },
    { enabled: canReadConfiguration && section === "class-subjects" && Boolean(selectedClassId) },
  );

  function invalidateAcademicQueries() {
    if (school) {
      void queryClient.invalidateQueries({
        queryKey: ["school-data", school.id],
      });
    }
  }

  const selectedYear = activeYears.data?.data.find((y) => y.id === selectedYearId);
  const selectedClass = activeClasses.data?.data.find((c) => c.id === selectedClassId);

  function selectSection(nextSection: SectionId) {
    setSection(nextSection);
    setSearch("");
    setStatus("all");
  }

  if (!canReadConfiguration) {
    return (
      <UnauthorizedState
        description="Your school access does not include permission to read academic configuration."
        title="Academic configuration access unavailable"
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">School structure</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Academics</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Configure academic periods, year-scoped grade levels, sections, and subject offerings.
          </p>
        </div>
        <div>
          {canManageConfiguration && section === "academic-years" && (
            <Button onClick={() => setSheetMode({ type: "create-year" })}>
              <Plus className="mr-2 size-4" /> Add academic year
            </Button>
          )}
          {canManageConfiguration && section === "terms" && (
            <Button
              disabled={!selectedYearId}
              onClick={() => setSheetMode({ type: "create-term", defaultYearId: selectedYearId })}
            >
              <Plus className="mr-2 size-4" /> Add term
            </Button>
          )}
          {canManageConfiguration && section === "classes" && (
            <Button
              disabled={!selectedYearId}
              onClick={() => setSheetMode({ type: "create-class", defaultYearId: selectedYearId })}
            >
              <Plus className="mr-2 size-4" /> Add class
            </Button>
          )}
          {canManageConfiguration && section === "streams" && (
            <Button
              disabled={!selectedClassId}
              onClick={() =>
                setSheetMode({ type: "create-stream", defaultClassId: selectedClassId })
              }
            >
              <Plus className="mr-2 size-4" /> Add stream
            </Button>
          )}
          {canManageConfiguration && section === "subjects" && (
            <Button onClick={() => setSheetMode({ type: "create-subject" })}>
              <Plus className="mr-2 size-4" /> Add subject
            </Button>
          )}
          {canManageConfiguration && section === "class-subjects" && (
            <Button
              disabled={!selectedClassId}
              onClick={() =>
                setSheetMode({ type: "assign-subject", defaultClassId: selectedClassId })
              }
            >
              <Plus className="mr-2 size-4" /> Assign subject
            </Button>
          )}
        </div>
      </section>

      {/* Tabs */}
      <div
        aria-label="Academic configuration"
        className="flex gap-1 overflow-x-auto border-b"
        role="tablist"
      >
        {sections.map((item) => (
          <button
            aria-selected={section === item.id}
            aria-controls={`academic-panel-${item.id}`}
            className={`min-h-11 shrink-0 border-b-2 px-4 text-sm font-medium transition-colors ${
              section === item.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            id={`academic-tab-${item.id}`}
            key={item.id}
            onClick={() => selectSection(item.id)}
            onKeyDown={(event) => {
              const currentIndex = sections.findIndex((tab) => tab.id === item.id);
              let nextIndex: number;

              switch (event.key) {
                case "ArrowRight":
                  nextIndex = (currentIndex + 1) % sections.length;
                  break;
                case "ArrowLeft":
                  nextIndex = (currentIndex - 1 + sections.length) % sections.length;
                  break;
                case "Home":
                  nextIndex = 0;
                  break;
                case "End":
                  nextIndex = sections.length - 1;
                  break;
                default:
                  return;
              }

              event.preventDefault();
              selectSection(sections[nextIndex].id);
              const tabs =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              tabs?.[nextIndex]?.focus();
            }}
            role="tab"
            tabIndex={section === item.id ? 0 : -1}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card
        aria-labelledby={`academic-tab-${section}`}
        className="shadow-none"
        id={`academic-panel-${section}`}
        role="tabpanel"
        tabIndex={0}
      >
        <CardContent className="space-y-4 p-4 sm:p-5">
          {!canManageConfiguration && (
            <p className="text-sm text-muted-foreground" role="status">
              Read-only: academic configuration management permission is required to make changes.
            </p>
          )}
          {/* Controls bar */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Contextual Academic Year selector */}
            {(section === "terms" ||
              section === "classes" ||
              section === "streams" ||
              section === "class-subjects") && (
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Academic year</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  disabled={
                    activeYears.isPending ||
                    activeYears.isError ||
                    activeYears.data?.data.length === 0
                  }
                  onChange={(e) => {
                    setSelectedYearIdState(e.target.value);
                    setSelectedClassIdState("");
                  }}
                  value={selectedYearId}
                >
                  {activeYears.data?.data.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name} ({year.startsOn} to {year.endsOn})
                    </option>
                  ))}
                  {activeYears.isPending && <option value="">Loading academic years...</option>}
                  {activeYears.isError && <option value="">Academic years unavailable</option>}
                  {!activeYears.isPending &&
                    !activeYears.isError &&
                    activeYears.data?.data.length === 0 && (
                      <option value="">No active academic years</option>
                    )}
                </select>
              </label>
            )}

            {/* Contextual Class selector for Streams and Class Subjects */}
            {(section === "streams" || section === "class-subjects") && (
              <label className="space-y-1.5 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Class</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  disabled={
                    !selectedYearId ||
                    activeClasses.isPending ||
                    activeClasses.isError ||
                    activeClasses.data?.data.length === 0
                  }
                  onChange={(e) => setSelectedClassIdState(e.target.value)}
                  value={selectedClassId}
                >
                  {activeClasses.data?.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {activeClasses.isPending && <option value="">Loading classes...</option>}
                  {activeClasses.isError && <option value="">Classes unavailable</option>}
                  {!activeClasses.isPending &&
                    !activeClasses.isError &&
                    activeClasses.data?.data.length === 0 && (
                      <option value="">No active classes</option>
                    )}
                </select>
              </label>
            )}

            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Search</span>
              <input
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${sections.find((item) => item.id === section)?.label.toLowerCase()}`}
                type="search"
                value={search}
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                onChange={(event) => setStatus(event.target.value)}
                value={status}
              >
                <option value="all">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
          </div>

          {/* Section 1: Academic Years */}
          {section === "academic-years" && (
            <AcademicYearsTable
              canManage={canManageConfiguration}
              onDeactivate={(record) =>
                setDeactivateTarget({
                  type: "academicYears",
                  id: record.id,
                  name: record.name,
                })
              }
              onEdit={(record) => setSheetMode({ type: "edit-year", record })}
              query={yearsQuery}
            />
          )}

          {/* Section 2: Terms */}
          {section === "terms" && (
            <>
              {activeYears.isPending && <RequestLoading />}
              {activeYears.isError && (
                <AcademicQueryError
                  error={activeYears.error}
                  isFetching={activeYears.isFetching}
                  onRetry={() => void activeYears.refetch()}
                />
              )}
              {!activeYears.isPending && !activeYears.isError && !selectedYearId && (
                <p className="rounded-md border p-4 text-sm text-muted-foreground">
                  Create and activate an academic year first before managing terms.
                </p>
              )}
              {selectedYearId && (
                <TermsTable
                  canManage={canManageConfiguration}
                  onDeactivate={(record) =>
                    setDeactivateTarget({
                      type: "terms",
                      id: record.id,
                      name: record.name,
                    })
                  }
                  onEdit={(record) =>
                    setSheetMode({
                      type: "edit-term",
                      record,
                      year: selectedYear,
                    })
                  }
                  query={termsQuery}
                  yearName={selectedYear?.name}
                />
              )}
            </>
          )}

          {/* Section 3: Classes */}
          {section === "classes" && (
            <>
              {activeYears.isPending && <RequestLoading />}
              {activeYears.isError && (
                <AcademicQueryError
                  error={activeYears.error}
                  isFetching={activeYears.isFetching}
                  onRetry={() => void activeYears.refetch()}
                />
              )}
              {!activeYears.isPending && !activeYears.isError && !selectedYearId && (
                <p className="rounded-md border p-4 text-sm text-muted-foreground">
                  Create and activate an academic year first before managing classes.
                </p>
              )}
              {selectedYearId && (
                <ClassesTable
                  canManage={canManageConfiguration}
                  onDeactivate={(record) =>
                    setDeactivateTarget({
                      type: "classes",
                      id: record.id,
                      name: record.name,
                    })
                  }
                  onEdit={(record) => setSheetMode({ type: "edit-class", record })}
                  query={classesQuery}
                  yearName={selectedYear?.name}
                />
              )}
            </>
          )}

          {/* Section 4: Streams */}
          {section === "streams" && (
            <>
              {activeYears.isPending && <RequestLoading />}
              {activeYears.isError && (
                <AcademicQueryError
                  error={activeYears.error}
                  isFetching={activeYears.isFetching}
                  onRetry={() => void activeYears.refetch()}
                />
              )}
              {!activeYears.isPending && !activeYears.isError && !selectedYearId && (
                <p className="rounded-md border p-4 text-sm text-muted-foreground">
                  Create and activate an academic year first before configuring streams.
                </p>
              )}
              {Boolean(selectedYearId) && activeClasses.isPending && <RequestLoading />}
              {Boolean(selectedYearId) && activeClasses.isError && (
                <AcademicQueryError
                  error={activeClasses.error}
                  isFetching={activeClasses.isFetching}
                  onRetry={() => void activeClasses.refetch()}
                />
              )}
              {Boolean(selectedYearId) &&
                !activeClasses.isPending &&
                !activeClasses.isError &&
                !selectedClassId && (
                  <p className="rounded-md border p-4 text-sm text-muted-foreground">
                  No active classes are configured for this academic year. Add or activate a class
                  before managing streams.
                  </p>
                )}
              {selectedClassId && (
                <StreamsTable
                  canManage={canManageConfiguration}
                  classNameProp={selectedClass?.name}
                  onDeactivate={(record) =>
                    setDeactivateTarget({
                      type: "streams",
                      id: record.id,
                      name: record.name,
                    })
                  }
                  onEdit={(record) => setSheetMode({ type: "edit-stream", record })}
                  query={streamsQuery}
                />
              )}
            </>
          )}

          {/* Section 5: Subjects */}
          {section === "subjects" && (
            <SubjectsTable
              canManage={canManageConfiguration}
              onDeactivate={(record) =>
                setDeactivateTarget({
                  type: "subjects",
                  id: record.id,
                  name: record.name,
                })
              }
              onEdit={(record) => setSheetMode({ type: "edit-subject", record })}
              query={subjectsQuery}
            />
          )}

          {/* Section 6: Class-Subject Assignments */}
          {section === "class-subjects" && (
            <>
              {activeYears.isPending && <RequestLoading />}
              {activeYears.isError && (
                <AcademicQueryError
                  error={activeYears.error}
                  isFetching={activeYears.isFetching}
                  onRetry={() => void activeYears.refetch()}
                />
              )}
              {!activeYears.isPending && !activeYears.isError && !selectedYearId && (
                <p className="rounded-md border p-4 text-sm text-muted-foreground">
                  Create and activate an academic year first before assigning subjects.
                </p>
              )}
              {Boolean(selectedYearId) && activeClasses.isPending && <RequestLoading />}
              {Boolean(selectedYearId) && activeClasses.isError && (
                <AcademicQueryError
                  error={activeClasses.error}
                  isFetching={activeClasses.isFetching}
                  onRetry={() => void activeClasses.refetch()}
                />
              )}
              {Boolean(selectedYearId) &&
                !activeClasses.isPending &&
                !activeClasses.isError &&
                !selectedClassId && (
                  <p className="rounded-md border p-4 text-sm text-muted-foreground">
                  No active classes are configured for this academic year. Add or activate a class
                  before assigning subjects.
                  </p>
                )}
              {selectedClassId && (
                <ClassSubjectsTable
                  canManage={canManageConfiguration}
                  classNameProp={selectedClass?.name}
                  onDeactivate={(record, subjectName) =>
                    setDeactivateTarget({
                      type: "classSubjects",
                      id: record.id,
                      name: `${subjectName} (${selectedClass?.name})`,
                    })
                  }
                  query={classSubjectsQuery}
                  subjects={activeSubjects.data?.data ?? []}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Slide-over Sheet for Create and Edit forms */}
      <Sheet open={Boolean(sheetMode)} onOpenChange={(open) => !open && setSheetMode(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {sheetMode && (
            <AcademicForm
              activeClasses={activeClasses.data?.data ?? []}
              activeSubjects={activeSubjects.data?.data ?? []}
              activeYears={activeYears.data?.data ?? []}
              mode={sheetMode}
              onClose={() => setSheetMode(null)}
              onSuccess={() => {
                setSheetMode(null);
                invalidateAcademicQueries();
              }}
              schoolId={school?.id ?? ""}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Modal Dialog for Deactivation Confirmation */}
      <Dialog
        open={Boolean(deactivateTarget)}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm deactivation</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate{" "}
              <strong className="text-foreground">{deactivateTarget?.name}</strong>?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <p className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>
                Deactivating is terminal and cannot be undone. Records with active dependent items
                (such as active terms, classes, streams, or timetable lessons) cannot be deactivated
                until those dependencies are deactivated first.
              </span>
            </p>
          </div>

          <DeactivateAction
            onCancel={() => setDeactivateTarget(null)}
            onSuccess={() => {
              setDeactivateTarget(null);
              invalidateAcademicQueries();
            }}
            schoolId={school?.id ?? ""}
            target={deactivateTarget}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==========================================
// TABLE SUBCOMPONENTS
// ==========================================

function AcademicYearsTable({
  canManage,
  query,
  onEdit,
  onDeactivate,
}: {
  canManage: boolean;
  query: ReturnType<typeof useSchoolList<AcademicYear>>;
  onEdit: (record: AcademicYear) => void;
  onDeactivate: (record: AcademicYear) => void;
}) {
  if (query.isPending) return <RequestLoading />;
  if (query.isError) {
    return (
      <AcademicQueryError
        error={query.error}
        isFetching={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const items = query.data.data;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[620px] border-collapse text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Starts on</th>
            <th className="px-4 py-3 font-medium">Ends on</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={5}>
                No academic years found.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3">{item.startsOn}</td>
                <td className="px-4 py-3">{item.endsOn}</td>
                <td className="px-4 py-3">
                  <Badge variant={item.status === "ACTIVE" ? "default" : "secondary"}>
                    {item.status.toLowerCase()}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {item.status === "ACTIVE" ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        aria-label={`Edit ${item.name}`}
                        disabled={!canManage}
                        onClick={() => onEdit(item)}
                        size="sm"
                        variant="outline"
                      >
                        <Pencil className="size-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                      <Button
                        aria-label={`Deactivate ${item.name}`}
                        disabled={!canManage}
                        onClick={() => onDeactivate(item)}
                        size="sm"
                        variant="outline"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                        <span className="hidden sm:inline">Deactivate</span>
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TermsTable({
  canManage,
  query,
  yearName,
  onEdit,
  onDeactivate,
}: {
  canManage: boolean;
  query: ReturnType<typeof useSchoolList<Term>>;
  yearName?: string;
  onEdit: (record: Term) => void;
  onDeactivate: (record: Term) => void;
}) {
  if (query.isPending) return <RequestLoading />;
  if (query.isError) {
    return (
      <AcademicQueryError
        error={query.error}
        isFetching={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const items = query.data.data;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[650px] border-collapse text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Term</th>
            <th className="px-4 py-3 font-medium">Academic year</th>
            <th className="px-4 py-3 font-medium">Starts on</th>
            <th className="px-4 py-3 font-medium">Ends on</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={6}>
                No terms found for this academic year.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3">{yearName ?? "—"}</td>
                <td className="px-4 py-3">{item.startsOn}</td>
                <td className="px-4 py-3">{item.endsOn}</td>
                <td className="px-4 py-3">
                  <Badge variant={item.status === "ACTIVE" ? "default" : "secondary"}>
                    {item.status.toLowerCase()}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {item.status === "ACTIVE" ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        aria-label={`Edit ${item.name}`}
                        disabled={!canManage}
                        onClick={() => onEdit(item)}
                        size="sm"
                        variant="outline"
                      >
                        <Pencil className="size-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                      <Button
                        aria-label={`Deactivate ${item.name}`}
                        disabled={!canManage}
                        onClick={() => onDeactivate(item)}
                        size="sm"
                        variant="outline"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                        <span className="hidden sm:inline">Deactivate</span>
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ClassesTable({
  canManage,
  query,
  yearName,
  onEdit,
  onDeactivate,
}: {
  canManage: boolean;
  query: ReturnType<typeof useSchoolList<AcademicClass>>;
  yearName?: string;
  onEdit: (record: AcademicClass) => void;
  onDeactivate: (record: AcademicClass) => void;
}) {
  if (query.isPending) return <RequestLoading />;
  if (query.isError) {
    return (
      <AcademicQueryError
        error={query.error}
        isFetching={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const items = query.data.data;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[500px] border-collapse text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Class name</th>
            <th className="px-4 py-3 font-medium">Academic year</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={4}>
                No classes configured for this academic year.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3">{yearName ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={item.status === "ACTIVE" ? "default" : "secondary"}>
                    {item.status.toLowerCase()}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {item.status === "ACTIVE" ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        aria-label={`Edit ${item.name}`}
                        disabled={!canManage}
                        onClick={() => onEdit(item)}
                        size="sm"
                        variant="outline"
                      >
                        <Pencil className="size-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                      <Button
                        aria-label={`Deactivate ${item.name}`}
                        disabled={!canManage}
                        onClick={() => onDeactivate(item)}
                        size="sm"
                        variant="outline"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                        <span className="hidden sm:inline">Deactivate</span>
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StreamsTable({
  canManage,
  query,
  classNameProp,
  onEdit,
  onDeactivate,
}: {
  canManage: boolean;
  query: ReturnType<typeof useSchoolList<ClassStream>>;
  classNameProp?: string;
  onEdit: (record: ClassStream) => void;
  onDeactivate: (record: ClassStream) => void;
}) {
  if (query.isPending) return <RequestLoading />;
  if (query.isError) {
    return (
      <AcademicQueryError
        error={query.error}
        isFetching={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const items = query.data.data;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[500px] border-collapse text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Stream name</th>
            <th className="px-4 py-3 font-medium">Parent class</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={4}>
                No streams configured for this class.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3">{classNameProp ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={item.status === "ACTIVE" ? "default" : "secondary"}>
                    {item.status.toLowerCase()}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {item.status === "ACTIVE" ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        aria-label={`Edit ${item.name}`}
                        disabled={!canManage}
                        onClick={() => onEdit(item)}
                        size="sm"
                        variant="outline"
                      >
                        <Pencil className="size-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                      <Button
                        aria-label={`Deactivate ${item.name}`}
                        disabled={!canManage}
                        onClick={() => onDeactivate(item)}
                        size="sm"
                        variant="outline"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                        <span className="hidden sm:inline">Deactivate</span>
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SubjectsTable({
  canManage,
  query,
  onEdit,
  onDeactivate,
}: {
  canManage: boolean;
  query: ReturnType<typeof useSchoolList<Subject>>;
  onEdit: (record: Subject) => void;
  onDeactivate: (record: Subject) => void;
}) {
  if (query.isPending) return <RequestLoading />;
  if (query.isError) {
    return (
      <AcademicQueryError
        error={query.error}
        isFetching={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const items = query.data.data;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Subject name</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={3}>
                No subjects found in the catalog.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr className="border-t" key={item.id}>
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3">
                  <Badge variant={item.status === "ACTIVE" ? "default" : "secondary"}>
                    {item.status.toLowerCase()}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {item.status === "ACTIVE" ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        aria-label={`Edit ${item.name}`}
                        disabled={!canManage}
                        onClick={() => onEdit(item)}
                        size="sm"
                        variant="outline"
                      >
                        <Pencil className="size-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                      <Button
                        aria-label={`Deactivate ${item.name}`}
                        disabled={!canManage}
                        onClick={() => onDeactivate(item)}
                        size="sm"
                        variant="outline"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                        <span className="hidden sm:inline">Deactivate</span>
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ClassSubjectsTable({
  canManage,
  query,
  subjects,
  classNameProp,
  onDeactivate,
}: {
  canManage: boolean;
  query: ReturnType<typeof useSchoolList<ClassSubject>>;
  subjects: Subject[];
  classNameProp?: string;
  onDeactivate: (record: ClassSubject, subjectName: string) => void;
}) {
  if (query.isPending) return <RequestLoading />;
  if (query.isError) {
    return (
      <AcademicQueryError
        error={query.error}
        isFetching={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const items = query.data.data;
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[500px] border-collapse text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Assigned subject</th>
            <th className="px-4 py-3 font-medium">Class</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td className="px-4 py-12 text-center text-sm text-muted-foreground" colSpan={4}>
                No subjects assigned to this class.
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const subjectName = subjectMap.get(item.subjectId) ?? "Subject name unavailable";
              return (
                <tr className="border-t" key={item.id}>
                  <td className="px-4 py-3 font-medium">{subjectName}</td>
                  <td className="px-4 py-3">{classNameProp ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={item.status === "ACTIVE" ? "default" : "secondary"}>
                      {item.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.status === "ACTIVE" ? (
                      <Button
                        aria-label={`Unassign ${subjectName}`}
                        disabled={!canManage}
                        onClick={() => onDeactivate(item, subjectName)}
                        size="sm"
                        variant="outline"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                        <span className="hidden sm:inline">Deactivate</span>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ==========================================
// FORM SUBCOMPONENT (CREATE / EDIT SHEET)
// ==========================================

function AcademicForm({
  mode,
  schoolId,
  activeYears,
  activeClasses,
  activeSubjects,
  onClose,
  onSuccess,
}: {
  mode: SheetMode;
  schoolId: string;
  activeYears: AcademicYear[];
  activeClasses: AcademicClass[];
  activeSubjects: Subject[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  // Form fields
  const [name, setName] = useState(() => {
    if ("record" in mode) return mode.record.name;
    return "";
  });
  const [startsOn, setStartsOn] = useState(() => {
    if ("record" in mode && "startsOn" in mode.record) return mode.record.startsOn;
    return "";
  });
  const [endsOn, setEndsOn] = useState(() => {
    if ("record" in mode && "endsOn" in mode.record) return mode.record.endsOn;
    return "";
  });
  const [academicYearId, setAcademicYearId] = useState(() => {
    if (mode.type === "create-term" || mode.type === "create-class") return mode.defaultYearId;
    if ("record" in mode && "academicYearId" in mode.record) return mode.record.academicYearId;
    return activeYears[0]?.id || "";
  });
  const [classId, setClassId] = useState(() => {
    if (mode.type === "create-stream" || mode.type === "assign-subject") return mode.defaultClassId;
    if ("record" in mode && "classId" in mode.record) return mode.record.classId;
    return activeClasses[0]?.id || "";
  });
  const [subjectId, setSubjectId] = useState(() => activeSubjects[0]?.id || "");

  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<string | null>(null);

  const selectedYear = activeYears.find((y) => y.id === academicYearId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);
    setInvalidField(null);

    // Validation
    if (mode.type !== "assign-subject" && !name.trim()) {
      setError("Name is required.");
      setInvalidField("name");
      return;
    }

    if (
      mode.type === "create-year" ||
      mode.type === "edit-year" ||
      mode.type === "create-term" ||
      mode.type === "edit-term"
    ) {
      if (!startsOn || !endsOn) {
        const missingDateField = startsOn ? "endsOn" : "startsOn";
        setError(startsOn ? "End date is required." : "Start date is required.");
        setInvalidField(missingDateField);
        return;
      }
      if (startsOn > endsOn) {
        setError("Start date must be on or before end date.");
        setInvalidField("startsOn");
        return;
      }
    }

    if (mode.type === "create-term" || mode.type === "edit-term") {
      const year = mode.type === "edit-term" ? mode.year : selectedYear;
      if (year && (startsOn < year.startsOn || endsOn > year.endsOn)) {
        setError(
          `Term dates must be within the academic year dates (${year.startsOn} to ${year.endsOn}).`,
        );
        setInvalidField(startsOn < year.startsOn ? "startsOn" : "endsOn");
        return;
      }
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (mode.type === "create-year") {
        await apiRequest(`/schools/${encodeURIComponent(schoolId)}/academic-years`, {
          method: "POST",
          body: { name: name.trim(), startsOn, endsOn },
        });
      } else if (mode.type === "edit-year") {
        await apiRequest(
          `/schools/${encodeURIComponent(schoolId)}/academic-years/${encodeURIComponent(mode.record.id)}`,
          {
            method: "PATCH",
            body: { name: name.trim(), startsOn, endsOn },
          },
        );
      } else if (mode.type === "create-term") {
        await apiRequest(`/schools/${encodeURIComponent(schoolId)}/terms`, {
          method: "POST",
          body: { academicYearId, name: name.trim(), startsOn, endsOn },
        });
      } else if (mode.type === "edit-term") {
        await apiRequest(
          `/schools/${encodeURIComponent(schoolId)}/terms/${encodeURIComponent(mode.record.id)}`,
          {
            method: "PATCH",
            body: { name: name.trim(), startsOn, endsOn },
          },
        );
      } else if (mode.type === "create-class") {
        await apiRequest(`/schools/${encodeURIComponent(schoolId)}/classes`, {
          method: "POST",
          body: { academicYearId, name: name.trim() },
        });
      } else if (mode.type === "edit-class") {
        await apiRequest(
          `/schools/${encodeURIComponent(schoolId)}/classes/${encodeURIComponent(mode.record.id)}`,
          {
            method: "PATCH",
            body: { name: name.trim() },
          },
        );
      } else if (mode.type === "create-stream") {
        await apiRequest(`/schools/${encodeURIComponent(schoolId)}/streams`, {
          method: "POST",
          body: { classId, name: name.trim() },
        });
      } else if (mode.type === "edit-stream") {
        await apiRequest(
          `/schools/${encodeURIComponent(schoolId)}/streams/${encodeURIComponent(mode.record.id)}`,
          {
            method: "PATCH",
            body: { name: name.trim() },
          },
        );
      } else if (mode.type === "create-subject") {
        await apiRequest(`/schools/${encodeURIComponent(schoolId)}/subjects`, {
          method: "POST",
          body: { name: name.trim() },
        });
      } else if (mode.type === "edit-subject") {
        await apiRequest(
          `/schools/${encodeURIComponent(schoolId)}/subjects/${encodeURIComponent(mode.record.id)}`,
          {
            method: "PATCH",
            body: { name: name.trim() },
          },
        );
      } else if (mode.type === "assign-subject") {
        await apiRequest(`/schools/${encodeURIComponent(schoolId)}/class-subjects`, {
          method: "POST",
          body: { classId, subjectId },
        });
      }

      onSuccess();
    } catch (err) {
      setInvalidField(null);
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Operation failed. Check your connection and try again.");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const title =
    mode.type === "create-year"
      ? "Add academic year"
      : mode.type === "edit-year"
        ? "Edit academic year"
        : mode.type === "create-term"
          ? "Add term"
          : mode.type === "edit-term"
            ? "Edit term"
            : mode.type === "create-class"
              ? "Add class"
              : mode.type === "edit-class"
                ? "Edit class"
                : mode.type === "create-stream"
                  ? "Add stream"
                  : mode.type === "edit-stream"
                    ? "Edit stream"
                    : mode.type === "create-subject"
                      ? "Add subject"
                      : mode.type === "edit-subject"
                        ? "Edit subject"
                        : "Assign subject to class";

  const description =
    mode.type === "create-year" || mode.type === "edit-year"
      ? "Specify the name and date bounds for this academic year."
      : mode.type === "create-term" || mode.type === "edit-term"
        ? "Configure term dates within the parent academic year."
        : mode.type === "create-class" || mode.type === "edit-class"
          ? "Configure a grade level or class cohort for an academic year."
          : mode.type === "create-stream" || mode.type === "edit-stream"
            ? "Configure a stream or section within an academic class."
            : mode.type === "create-subject" || mode.type === "edit-subject"
              ? "Add or update a subject in the school curriculum catalog."
              : "Link an active subject offering to this class.";

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </div>

      {error && (
        <p
          id="academic-form-error"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Parent selector for Term create */}
      {mode.type === "create-term" && (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Academic year</span>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            onChange={(e) => setAcademicYearId(e.target.value)}
            required
            value={academicYearId}
          >
            {activeYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} ({y.startsOn} to {y.endsOn})
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Parent selector for Class create */}
      {mode.type === "create-class" && (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Academic year</span>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            onChange={(e) => setAcademicYearId(e.target.value)}
            required
            value={academicYearId}
          >
            {activeYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Parent selector for Stream create */}
      {mode.type === "create-stream" && (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Class</span>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            onChange={(e) => setClassId(e.target.value)}
            required
            value={classId}
          >
            {activeClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Class and Subject selectors for Class-Subject assignment */}
      {mode.type === "assign-subject" && (
        <>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Class</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              onChange={(e) => setClassId(e.target.value)}
              required
              value={classId}
            >
              {activeClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Subject</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              onChange={(e) => setSubjectId(e.target.value)}
              required
              value={subjectId}
            >
              {activeSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {/* Name input */}
      {mode.type !== "assign-subject" && (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Name</span>
          <input
            aria-describedby={invalidField === "name" ? "academic-form-error" : undefined}
            aria-invalid={invalidField === "name"}
            className="h-10 w-full rounded-md border border-input bg-background px-3"
            maxLength={mode.type.includes("subject") ? 120 : 100}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              mode.type.includes("year")
                ? "e.g. 2026"
                : mode.type.includes("term")
                  ? "e.g. Term 1"
                  : mode.type.includes("class")
                    ? "e.g. Grade 1"
                    : mode.type.includes("stream")
                      ? "e.g. Blue"
                      : "e.g. Mathematics"
            }
            required
            value={name}
          />
        </label>
      )}

      {/* Date inputs for Year and Term */}
      {(mode.type === "create-year" ||
        mode.type === "edit-year" ||
        mode.type === "create-term" ||
        mode.type === "edit-term") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Starts on</span>
            <input
              aria-describedby={invalidField === "startsOn" ? "academic-form-error" : undefined}
              aria-invalid={invalidField === "startsOn"}
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              onChange={(e) => setStartsOn(e.target.value)}
              required
              type="date"
              value={startsOn}
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Ends on</span>
            <input
              aria-describedby={invalidField === "endsOn" ? "academic-form-error" : undefined}
              aria-invalid={invalidField === "endsOn"}
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              onChange={(e) => setEndsOn(e.target.value)}
              required
              type="date"
              value={endsOn}
            />
          </label>
        </div>
      )}

      {/* Year bounds hint for Term */}
      {(mode.type === "create-term" || mode.type === "edit-term") && (
        <p className="text-xs text-muted-foreground">
          {mode.type === "edit-term" && mode.year
            ? `Must be within academic year: ${mode.year.startsOn} to ${mode.year.endsOn}`
            : selectedYear
              ? `Must be within academic year: ${selectedYear.startsOn} to ${selectedYear.endsOn}`
              : null}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onClose} type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={submitting} type="submit">
          {submitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ==========================================
// DEACTIVATE ACTION COMPONENT
// ==========================================

function DeactivateAction({
  target,
  schoolId,
  onCancel,
  onSuccess,
}: {
  target: DeactivateTarget | null;
  schoolId: string;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!target) return null;

  const endpointResource =
    target.type === "academicYears"
      ? "academic-years"
      : target.type === "terms"
        ? "terms"
        : target.type === "classes"
          ? "classes"
          : target.type === "streams"
            ? "streams"
            : target.type === "subjects"
              ? "subjects"
              : "class-subjects";

  async function handleDeactivate() {
    if (!target) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest(
        `/schools/${encodeURIComponent(schoolId)}/${endpointResource}/${encodeURIComponent(target.id)}/deactivate`,
        { method: "POST" },
      );
      onSuccess();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to deactivate record.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      <DialogFooter>
        <Button disabled={submitting} onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={submitting}
          onClick={handleDeactivate}
          type="button"
          variant="outline"
          className="border-destructive text-destructive hover:bg-destructive/10"
        >
          {submitting ? "Deactivating..." : "Deactivate"}
        </Button>
      </DialogFooter>
    </div>
  );
}
