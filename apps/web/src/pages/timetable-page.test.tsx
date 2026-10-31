import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { TimetablePage } from "./timetable-page";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({ school: { id: "school-1", permissions: [] as string[] } })),
}));

const timetableReadPermissions = [
  "timetable.read",
  "academics.configuration.read",
  "staff.profile.read",
];
const timetableManagePermissions = [
  ...timetableReadPermissions,
  "timetable.manage",
  "timetable.publish",
];

vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));

const fetchMock = vi.fn<typeof fetch>();

function renderTimetablePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TimetablePage />
    </QueryClientProvider>,
  );
}

function mockTimetableRequests({
  failLessonsOnce = false,
  failAvailabilityOnce = false,
  failPeriodsOnce = false,
  failRoomsOnce = false,
  includeSecondYear = false,
}: {
  failLessonsOnce?: boolean;
  failAvailabilityOnce?: boolean;
  failPeriodsOnce?: boolean;
  failRoomsOnce?: boolean;
  includeSecondYear?: boolean;
} = {}) {
  let lessonsRequests = 0;
  let availabilityRequests = 0;
  let periodsRequests = 0;
  let roomsRequests = 0;

  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), window.location.origin);
    const { pathname } = url;

    if (pathname.endsWith("/academic-years")) {
      const years = [
        {
          id: "year-1",
          name: "2026",
          startsOn: "2026-01-01",
          endsOn: "2026-12-31",
          status: "ACTIVE",
        },
      ];
      if (includeSecondYear) {
        years.push({
          id: "year-2",
          name: "2027",
          startsOn: "2027-01-01",
          endsOn: "2027-12-31",
          status: "ACTIVE",
        });
      }
      return jsonResponse(200, {
        data: years,
        meta: { limit: 100, offset: 0, total: years.length },
      });
    }

    if (pathname.endsWith("/academic-years/year-1/timetables")) {
      return jsonResponse(200, {
        data: [
          {
            id: "timetable-1",
            academicYearId: "year-1",
            name: "2026 Weekly Timetable",
            status: "PUBLISHED",
            publishedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      });
    }

    if (pathname.endsWith("/academic-years/year-2/timetables")) {
      return jsonResponse(200, {
        data: [
          {
            id: "timetable-2",
            academicYearId: "year-2",
            name: "2027 Weekly Timetable",
            status: "PUBLISHED",
            publishedAt: null,
            createdAt: "2027-01-01T00:00:00.000Z",
            updatedAt: "2027-01-01T00:00:00.000Z",
          },
        ],
      });
    }

    if (pathname.endsWith("/timetable-periods")) {
      periodsRequests += 1;
      if (failPeriodsOnce && periodsRequests === 1) {
        return jsonResponse(503, {
          error: { message: "Timetable periods are temporarily unavailable." },
        });
      }
      return jsonResponse(200, {
        data: [
          {
            id: "period-1",
            name: "Period 1",
            position: 1,
            startsAt: "08:00",
            endsAt: "08:40",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      });
    }

    if (
      pathname.endsWith("/timetables/timetable-1/lessons") ||
      pathname.endsWith("/timetables/timetable-2/lessons")
    ) {
      lessonsRequests += 1;
      if (failLessonsOnce && lessonsRequests === 1) {
        return jsonResponse(503, {
          error: { message: "Timetable lessons are temporarily unavailable." },
        });
      }
      return jsonResponse(200, { data: [] });
    }

    if (pathname.endsWith("/rooms")) {
      roomsRequests += 1;
      if (failRoomsOnce && roomsRequests === 1) {
        return jsonResponse(503, {
          error: { message: "Rooms are temporarily unavailable." },
        });
      }
      return jsonResponse(200, { data: [], meta: { limit: 100, offset: 0, total: 0 } });
    }

    if (
      pathname.endsWith("/classes") ||
      pathname.endsWith("/streams") ||
      pathname.endsWith("/subjects") ||
      pathname.endsWith("/class-subjects")
    ) {
      if (pathname.endsWith("/classes") && includeSecondYear) {
        const yearId = url.searchParams.get("academicYearId");
        const classRecord =
          yearId === "year-2"
            ? {
                id: "class-2",
                name: "Grade 6",
                academicYearId: "year-2",
                status: "ACTIVE",
              }
            : {
                id: "class-1",
                name: "Grade 5",
                academicYearId: "year-1",
                status: "ACTIVE",
              };
        return jsonResponse(200, {
          data: [classRecord],
          meta: { limit: 100, offset: 0, total: 1 },
        });
      }
      return jsonResponse(200, { data: [], meta: { limit: 100, offset: 0, total: 0 } });
    }

    if (pathname.endsWith("/staff")) {
      expect(url.searchParams.get("sortBy")).toBe("familyName");
      return jsonResponse(200, {
        data: [
          {
            id: "staff-1",
            staffNumber: "T-001",
            givenName: "Amina",
            middleName: null,
            familyName: "Njeri",
            positionTitle: "Teacher",
            status: "ACTIVE",
          },
        ],
        meta: { limit: 100, offset: 0, total: 1 },
      });
    }

    if (pathname.endsWith("/staff/staff-1/availability")) {
      availabilityRequests += 1;
      if (failAvailabilityOnce && availabilityRequests === 1) {
        return jsonResponse(503, {
          error: { message: "Staff availability is temporarily unavailable." },
        });
      }
      return jsonResponse(200, { data: [] });
    }

    throw new Error(`Unexpected request: ${pathname}`);
  });

  return {
    getLessonsRequests: () => lessonsRequests,
    getAvailabilityRequests: () => availabilityRequests,
    getPeriodsRequests: () => periodsRequests,
    getRoomsRequests: () => roomsRequests,
  };
}

describe("TimetablePage grid reads", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({ school: { id: "school-1", permissions: timetableManagePermissions } });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not request timetable data without server-returned read permissions", async () => {
    useAuthMock.mockReturnValue({ school: { id: "school-1", permissions: [] } });

    renderTimetablePage();

    expect(await screen.findByText("Timetable access unavailable")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides timetable mutation controls in a read-only context", async () => {
    useAuthMock.mockReturnValue({ school: { id: "school-1", permissions: timetableReadPermissions } });
    mockTimetableRequests();

    renderTimetablePage();

    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish Timetable" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unpublish to Edit" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Periods & Rooms Setup" }));
    expect(screen.queryByRole("button", { name: "Add Period" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Room" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Staff Availability" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Select staff member for availability" }), {
      target: { value: "staff-1" },
    });
    expect(await screen.findByText("No Availability Restrictions")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Window" })).toBeNull();
  });

  it("shows a retryable error instead of an empty grid when lessons fail to load", async () => {
    const requests = mockTimetableRequests({ failLessonsOnce: true });

    renderTimetablePage();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Timetable lessons are temporarily unavailable.",
    );
    expect(screen.queryByRole("table")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading timetable lessons" }));

    expect(await screen.findByRole("table")).toBeTruthy();
    expect(requests.getLessonsRequests()).toBe(2);
  });

  it("clears the class filter when navigating to a different academic year", async () => {
    mockTimetableRequests({ includeSecondYear: true });

    renderTimetablePage();

    const classFilter = await screen.findByRole("combobox", {
      name: "Filter timetable by class",
    });
    fireEvent.change(classFilter, { target: { value: "class-1" } });
    expect(classFilter).toHaveProperty("value", "class-1");

    fireEvent.change(screen.getByRole("combobox", { name: "Academic Year" }), {
      target: { value: "year-2" },
    });

    expect(await screen.findByRole("option", { name: "Grade 6" })).toBeTruthy();
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Filter timetable by class" }),
      ).toHaveProperty("value", "all");
    });
  });

  it("does not mistake a failed availability read for unrestricted scheduling", async () => {
    const requests = mockTimetableRequests({ failAvailabilityOnce: true });

    renderTimetablePage();
    fireEvent.click(screen.getByRole("button", { name: "Staff Availability" }));
    await screen.findByRole("option", { name: "Amina Njeri — Teacher" });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Select staff member for availability" }),
      { target: { value: "staff-1" } },
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Staff availability is temporarily unavailable.",
    );
    expect(screen.queryByText("No Availability Restrictions")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading staff availability" }));

    expect(await screen.findByText("No Availability Restrictions")).toBeTruthy();
    expect(requests.getAvailabilityRequests()).toBe(2);
  });

  it("shows a retryable error instead of an empty setup list when periods fail to load", async () => {
    const requests = mockTimetableRequests({ failPeriodsOnce: true });

    renderTimetablePage();
    fireEvent.click(screen.getByRole("button", { name: "Periods & Rooms Setup" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Timetable periods are temporarily unavailable.",
    );
    expect(screen.queryByText("No periods defined yet. Add the daily class periods.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading timetable periods" }));

    expect(await screen.findByText("Period 1")).toBeTruthy();
    expect(requests.getPeriodsRequests()).toBe(2);
  });

  it("shows a retryable error instead of an empty room list when rooms fail to load", async () => {
    const requests = mockTimetableRequests({ failRoomsOnce: true });

    renderTimetablePage();
    fireEvent.click(screen.getByRole("button", { name: "Periods & Rooms Setup" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Rooms are temporarily unavailable.",
    );
    expect(screen.queryByText("No rooms configured yet. Add classrooms and facilities.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry loading rooms" }));

    expect(await screen.findByText("No rooms configured yet. Add classrooms and facilities.")).toBeTruthy();
    expect(requests.getRoomsRequests()).toBe(2);
  });
});
