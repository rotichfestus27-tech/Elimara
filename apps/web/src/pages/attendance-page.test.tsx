import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { AttendancePage } from "./attendance-page";

const { attendancePermissions, useAuthMock } = vi.hoisted(() => ({
  attendancePermissions: [
    "attendance.register.read",
    "attendance.register.manage",
    "attendance.register.correct",
    "students.profile.read",
    "staff.profile.read",
    "academics.configuration.read",
    "timetable.read",
  ],
  useAuthMock: vi.fn(() => ({ school: { id: "school-1", permissions: [] as string[] } })),
}));

vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));

const fetchMock = vi.fn<typeof fetch>();
const today = new Date();
const register = {
  id: "register-1",
  academicYearId: "year-1",
  date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
  type: "STUDENT_DAILY",
  classId: "class-1",
  streamId: null,
  timetableLessonId: null,
  status: "OPEN",
  createdAt: "2026-10-27T08:00:00.000Z",
};

function renderAttendancePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AttendancePage />
    </QueryClientProvider>,
  );
}

function mockAttendanceRequests({
  failStudentList = false,
  failStaffList = false,
  failRegisterList = false,
  failRecordList = false,
  failSummary = false,
  failAttendanceWrite = false,
  failLessonList = false,
  failTimetableList = false,
  summaryRows = [],
  registerType = "STUDENT_DAILY",
}: {
  failStudentList?: boolean;
  failStaffList?: boolean;
  failRegisterList?: boolean;
  failRecordList?: boolean;
  failSummary?: boolean;
  failAttendanceWrite?: boolean;
  failLessonList?: boolean;
  failTimetableList?: boolean;
  summaryRows?: Array<{ date: string; status: string; total: number }>;
  registerType?: "STUDENT_DAILY" | "STAFF_DAILY";
} = {}) {
  let registerListRequests = 0;
  let studentListRequests = 0;
  let staffListRequests = 0;
  let recordListRequests = 0;
  let summaryRequests = 0;
  let attendanceWriteRequests = 0;
  let lessonListRequests = 0;
  let timetableListRequests = 0;
  const registerListQueries: URLSearchParams[] = [];

  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input), window.location.origin);
    const { pathname } = url;

    if (pathname.endsWith("/academic-years")) {
      return jsonResponse(200, {
        data: [
          {
            id: "year-1",
            name: "2026",
            startsOn: "2026-01-01",
            endsOn: "2026-12-31",
            status: "ACTIVE",
          },
        ],
        meta: { limit: 100, offset: 0, total: 1 },
      });
    }

    if (pathname.endsWith("/classes")) {
      return jsonResponse(200, {
        data: [{ id: "class-1", academicYearId: "year-1", name: "Grade 5", status: "ACTIVE" }],
        meta: { limit: 100, offset: 0, total: 1 },
      });
    }

    if (pathname.endsWith("/students")) {
      studentListRequests += 1;
      if (failStudentList && studentListRequests === 1) {
        return jsonResponse(503, {
          error: { message: "Student records are temporarily unavailable." },
        });
      }
      return jsonResponse(200, {
        data: [
          {
            id: "student-1",
            admissionNumber: "STU-001",
            givenName: "Amina",
            middleName: null,
            familyName: "Njeri",
            status: "ACTIVE",
          },
        ],
        meta: { limit: 100, offset: 0, total: 1 },
      });
    }

    if (pathname.endsWith("/staff")) {
      staffListRequests += 1;
      if (failStaffList && staffListRequests === 1) {
        return jsonResponse(503, {
          error: { message: "Staff records are temporarily unavailable." },
        });
      }
      return jsonResponse(200, {
        data: [
          {
            id: "staff-1",
            staffNumber: "EMP-001",
            givenName: "Mina",
            middleName: null,
            familyName: "Kariuki",
            positionTitle: "Teacher",
            status: "ACTIVE",
          },
        ],
        meta: { limit: 100, offset: 0, total: 1 },
      });
    }

    if (pathname.endsWith("/attendance/registers")) {
      registerListRequests += 1;
      registerListQueries.push(new URLSearchParams(url.searchParams));
      if (failRegisterList && registerListRequests === 1) {
        return jsonResponse(503, {
          error: { message: "Attendance registers are temporarily unavailable." },
        });
      }
      return jsonResponse(200, {
        data: [
          registerType === "STAFF_DAILY"
            ? { ...register, type: "STAFF_DAILY", classId: null }
            : register,
        ],
        meta: { limit: 100, offset: 0, total: 1 },
      });
    }

    if (pathname.endsWith("/attendance/registers/register-1/records")) {
      if (init?.method === "POST") {
        attendanceWriteRequests += 1;
        if (failAttendanceWrite && attendanceWriteRequests === 1) {
          return jsonResponse(503, {
            error: { message: "Attendance could not be saved. Try again." },
          });
        }
        return jsonResponse(200, { data: { id: "record-1" } });
      }
      recordListRequests += 1;
      if (failRecordList && recordListRequests === 1) {
        return jsonResponse(503, {
          error: { message: "Attendance records are temporarily unavailable." },
        });
      }
      return jsonResponse(200, { data: [] });
    }

    if (pathname.endsWith("/attendance/summary")) {
      summaryRequests += 1;
      if (failSummary && summaryRequests === 1) {
        return jsonResponse(503, {
          error: { message: "Attendance history is temporarily unavailable." },
        });
      }
      return jsonResponse(200, { data: summaryRows });
    }

    if (pathname.endsWith("/academic-years/year-1/timetables")) {
      timetableListRequests += 1;
      if (failTimetableList && timetableListRequests === 1) {
        return jsonResponse(503, {
          error: { message: "Published timetable is temporarily unavailable." },
        });
      }
      return jsonResponse(200, {
        data: [{ id: "timetable-1", name: "2026 Weekly Timetable", status: "PUBLISHED" }],
      });
    }

    if (pathname.endsWith("/timetables/timetable-1/lessons")) {
      lessonListRequests += 1;
      if (failLessonList && lessonListRequests === 1) {
        return jsonResponse(503, {
          error: { message: "Published lessons are temporarily unavailable." },
        });
      }
      return jsonResponse(200, { data: [] });
    }

    if (pathname.endsWith("/attendance/reasons")) {
      return jsonResponse(200, { data: [] });
    }

    if (
      pathname.endsWith("/streams") ||
      pathname.endsWith("/timetable-periods") ||
      pathname.endsWith("/subjects") ||
      pathname.endsWith("/class-subjects")
    ) {
      return jsonResponse(200, { data: [], meta: { limit: 100, offset: 0, total: 0 } });
    }

    throw new Error(`Unexpected request: ${pathname}`);
  });

  return {
    getRegisterListRequests: () => registerListRequests,
    getStudentListRequests: () => studentListRequests,
    getStaffListRequests: () => staffListRequests,
    getRecordListRequests: () => recordListRequests,
    getSummaryRequests: () => summaryRequests,
    getRegisterListQueries: () => registerListQueries,
    getAttendanceWriteRequests: () => attendanceWriteRequests,
    getLessonListRequests: () => lessonListRequests,
    getTimetableListRequests: () => timetableListRequests,
  };
}

describe("AttendancePage register read recovery", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ school: { id: "school-1", permissions: attendancePermissions } });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not request attendance or roster data without the server-returned read permission", async () => {
    useAuthMock.mockReturnValue({ school: { id: "school-1", permissions: [] } });

    renderAttendancePage();

    expect(await screen.findByText("Attendance access unavailable")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps attendance read-only without manage or correction permissions", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        permissions: attendancePermissions.filter(
          (permission) =>
            permission !== "attendance.register.manage" &&
            permission !== "attendance.register.correct",
        ),
      },
    });
    mockAttendanceRequests();

    renderAttendancePage();

    expect(await screen.findByText("Class Roll Call — Grade 5")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New Attendance Register" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark All Present" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Finalize Register" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark Amina Njeri present" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Absence Reasons" }));
    expect(await screen.findByRole("button", { name: "Absence Reasons" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Reason" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
  });

  it("shows a retryable error instead of an empty state when registers fail to load", async () => {
    const requests = mockAttendanceRequests({ failRegisterList: true });

    renderAttendancePage();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Attendance registers are temporarily unavailable.",
    );
    expect(screen.queryByText("No Attendance Registers Found")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading attendance registers" }));

    expect(await screen.findByText("Class Roll Call — Grade 5")).toBeTruthy();
    expect(requests.getRegisterListRequests()).toBe(2);
  });

  it("does not show an unmarked roster when attendance records fail to load", async () => {
    const requests = mockAttendanceRequests({ failRecordList: true });

    renderAttendancePage();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Attendance records are temporarily unavailable.",
    );
    expect(screen.queryByText("Not Marked")).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark All Present" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading attendance records" }));

    expect(await screen.findByText("Not Marked")).toBeTruthy();
    expect(requests.getRecordListRequests()).toBe(2);
  });

  it("does not treat a failed student roster request as an empty attendance roster", async () => {
    const requests = mockAttendanceRequests({ failStudentList: true });

    renderAttendancePage();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Student records are temporarily unavailable.",
    );
    expect(screen.queryByRole("button", { name: "Mark All Present" })).toBeNull();
    expect(screen.queryByText("Not Marked")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading attendance roster" }));

    expect(await screen.findByText("Not Marked")).toBeTruthy();
    expect(requests.getStudentListRequests()).toBe(2);
  });

  it("does not treat a failed staff roster request as an empty attendance roster", async () => {
    const requests = mockAttendanceRequests({
      failStaffList: true,
      registerType: "STAFF_DAILY",
    });

    renderAttendancePage();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Staff records are temporarily unavailable.",
    );
    expect(screen.queryByRole("button", { name: "Mark All Present" })).toBeNull();
    expect(screen.queryByText("Not Marked")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading attendance roster" }));

    expect(await screen.findByText("Mina Kariuki")).toBeTruthy();
    expect(await screen.findByText("Not Marked")).toBeTruthy();
    expect(requests.getStaffListRequests()).toBe(2);
  });

  it("uses an attendee-specific accessible name and selects late when choosing Late", async () => {
    mockAttendanceRequests();

    renderAttendancePage();

    fireEvent.click(await screen.findByRole("button", { name: "Mark Amina Njeri late" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "Attendance Status" })).toHaveProperty(
      "value",
      "LATE",
    );
    expect(within(dialog).getByLabelText(/Arrival Time/)).toBeTruthy();
  });

  it("shows failed mark submissions and preserves entered values for retry", async () => {
    const requests = mockAttendanceRequests({ failAttendanceWrite: true });

    renderAttendancePage();
    fireEvent.click(await screen.findByRole("button", { name: "Mark Amina Njeri late" }));

    const dialog = screen.getByRole("dialog");
    const arrivalTime = within(dialog).getByLabelText(/Arrival Time/);
    fireEvent.change(arrivalTime, { target: { value: "08:45" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Attendance" }));

    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Attendance could not be saved. Try again.",
    );
    expect(within(dialog).getByLabelText(/Arrival Time/)).toHaveProperty("value", "08:45");
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save Attendance" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(requests.getAttendanceWriteRequests()).toBe(2);
  });

  it("clears and omits the class filter for school-wide staff daily registers", async () => {
    const requests = mockAttendanceRequests();

    renderAttendancePage();
    const scopeFilter = screen.getByRole("combobox", { name: "Register Scope" });
    const classFilter = screen.getByRole("combobox", { name: "Class Filter" });

    await screen.findByRole("option", { name: "Grade 5" });
    fireEvent.change(classFilter, { target: { value: "class-1" } });
    await waitFor(() => {
      expect(requests.getRegisterListQueries().at(-1)?.get("classId")).toBe("class-1");
    });

    fireEvent.change(scopeFilter, { target: { value: "STAFF_DAILY" } });

    expect(classFilter).toHaveProperty("value", "ALL");
    expect(classFilter).toHaveProperty("disabled", true);
    await waitFor(() => {
      const lastQuery = requests.getRegisterListQueries().at(-1);
      expect(lastQuery?.get("type")).toBe("STAFF_DAILY");
      expect(lastQuery?.has("classId")).toBe(false);
    });
  });

  it("does not display attendance results or issue a summary request for a reversed date range", async () => {
    const requests = mockAttendanceRequests();

    renderAttendancePage();
    fireEvent.click(screen.getByRole("button", { name: "Summary & Analytics" }));

    expect(
      await screen.findByText("No attendance data recorded in the selected date range."),
    ).toBeTruthy();
    expect(requests.getSummaryRequests()).toBe(1);

    fireEvent.change(screen.getByLabelText("From Date"), {
      target: { value: "2099-01-01" },
    });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "The start date must be on or before the end date.",
    );
    expect(requests.getSummaryRequests()).toBe(1);
    expect(screen.queryByText("No attendance data recorded in the selected date range.")).toBeNull();
    expect(screen.queryByText("Overall Attendance Rate")).toBeNull();
  });

  it("rejects date ranges longer than the summary API limit", async () => {
    const requests = mockAttendanceRequests();

    renderAttendancePage();
    fireEvent.click(screen.getByRole("button", { name: "Summary & Analytics" }));
    await screen.findByText("No attendance data recorded in the selected date range.");

    fireEvent.change(screen.getByLabelText("From Date"), {
      target: { value: "2024-10-26" },
    });
    fireEvent.change(screen.getByLabelText("To Date"), {
      target: { value: "2025-10-27" },
    });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Choose a date range of 366 days or fewer.",
    );
    expect(requests.getSummaryRequests()).toBe(1);
    expect(screen.queryByText("Aggregated Attendance Rows")).toBeNull();
  });

  it("retries failed attendance history and does not report a 100% rate when there are no marks", async () => {
    const requests = mockAttendanceRequests({ failSummary: true });

    renderAttendancePage();
    fireEvent.click(screen.getByRole("button", { name: "Summary & Analytics" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Attendance history is temporarily unavailable.",
    );
    expect(screen.queryByText("Overall Attendance Rate")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading attendance history" }),
    );

    expect(
      await screen.findByText("No attendance data recorded in the selected date range."),
    ).toBeTruthy();
    expect(screen.getByText("Overall Attendance Rate")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(requests.getSummaryRequests()).toBe(2);
  });

  it("shows a retryable lesson error instead of reporting no scheduled lessons", async () => {
    const requests = mockAttendanceRequests({ failLessonList: true });

    renderAttendancePage();
    fireEvent.click(screen.getByRole("button", { name: "Timetable Lesson Attendance" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Published lessons are temporarily unavailable.",
    );
    expect(screen.queryByText(/No lessons are scheduled on/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading published lessons" }));

    expect(await screen.findByText(/No lessons are scheduled on/)).toBeTruthy();
    expect(requests.getLessonListRequests()).toBe(2);
  });

  it("shows a retryable timetable error instead of reporting no published timetable", async () => {
    const requests = mockAttendanceRequests({ failTimetableList: true });

    renderAttendancePage();
    fireEvent.click(screen.getByRole("button", { name: "Timetable Lesson Attendance" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Published timetable is temporarily unavailable.",
    );
    expect(screen.queryByText("No Published Timetable")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading published timetable" }));

    expect(await screen.findByText(/No lessons are scheduled on/)).toBeTruthy();
    expect(requests.getTimetableListRequests()).toBe(2);
  });
});
