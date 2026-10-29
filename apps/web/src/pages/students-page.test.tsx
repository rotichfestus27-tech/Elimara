import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { StudentsPage } from "./students-page";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    school: { id: "school-1", permissions: ["students.profile.read"] },
  })),
}));

vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));

const fetchMock = vi.fn<typeof fetch>();
const student = {
  id: "student-1",
  admissionNumber: "ADM-001",
  admissionYearId: "year-1",
  admissionApplicationId: "application-1",
  givenName: "Amina",
  middleName: null,
  familyName: "Njeri",
  dateOfBirth: null,
  status: "ACTIVE",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function renderStudentsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <StudentsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("StudentsPage pagination", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      school: { id: "school-1", permissions: ["students.profile.read"] },
    });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const offset = new URL(url, window.location.origin).searchParams.get("offset");
      const isStudents = url.includes("/students?");

      return jsonResponse(200, {
        data: isStudents ? [student] : [],
        meta: {
          total: isStudents ? 30 : 0,
          limit: 25,
          offset: Number(offset ?? 0),
        },
      });
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads subsequent student pages and resets pagination when search changes", async () => {
    renderStudentsPage();
    expect(await screen.findByText("Showing 1–1 of 30 students.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Showing 26–26 of 30 students.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/students?limit=25&offset=25"),
      expect.any(Object),
    );

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: "Search by student name or admission number",
      }),
      { target: { value: "Amina" } },
    );

    expect(await screen.findByText("Showing 1–1 of 30 students.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/students?limit=25&offset=0&q=Amina"),
      expect.any(Object),
    );
  });

  it("uses the student list response limit and offset for pagination", async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      const offset = Number(new URL(url, window.location.origin).searchParams.get("offset") ?? 0);

      return Promise.resolve(
        jsonResponse(200, {
          data: [student],
          meta: { total: 30, limit: 10, offset },
        }),
      );
    });

    renderStudentsPage();

    expect(await screen.findByText("Showing 1–1 of 30 students.")).toBeTruthy();
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Showing 11–11 of 30 students.")).toBeTruthy();
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/students?limit=10&offset=10"),
      expect.any(Object),
    );
  });

  it("uses the guardian list response limit for subsequent pages", async () => {
    useAuthMock.mockReturnValue({
      school: { id: "school-1", permissions: ["guardians.profile.read"] },
    });

    fetchMock.mockImplementation((input) => {
      const url = String(input);
      const offset = Number(new URL(url, window.location.origin).searchParams.get("offset") ?? 0);

      return Promise.resolve(
        jsonResponse(200, {
          data: [
            {
              id: "guardian-1",
              givenName: "Grace",
              middleName: null,
              familyName: "Njeri",
              email: null,
              phone: null,
              createdAt: "2026-09-01T10:00:00.000Z",
              updatedAt: "2026-09-01T10:00:00.000Z",
            },
          ],
          meta: { total: 30, limit: 10, offset },
        }),
      );
    });

    renderStudentsPage();

    expect(await screen.findByText("Showing 1–1 of 30 guardians.")).toBeTruthy();
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Showing 11–11 of 30 guardians.")).toBeTruthy();
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/guardians?limit=10&offset=10"),
      expect.any(Object),
    );
  });

  it("retries a failed student-list request and displays recovered records", async () => {
    let requestCount = 0;
    fetchMock.mockImplementation((input) => {
      if (!String(input).includes("/students?")) {
        return Promise.resolve(
          jsonResponse(200, { data: [], meta: { total: 0, limit: 25, offset: 0 } }),
        );
      }

      requestCount += 1;
      if (requestCount === 1) {
        return Promise.resolve(
          jsonResponse(503, {
            error: { message: "Student records are temporarily unavailable." },
          }),
        );
      }

      return Promise.resolve(
        jsonResponse(200, {
          data: [student],
          meta: { total: 1, limit: 25, offset: 0 },
        }),
      );
    });

    renderStudentsPage();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Student records are temporarily unavailable.",
    );
    const studentsTab = screen.getByRole("button", { name: /^Students Directory/ });
    expect(within(studentsTab).getByText("Unavailable")).toBeTruthy();
    expect(within(studentsTab).queryByText("0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading students" }));

    expect(await screen.findByRole("button", { name: "Manage" })).toBeTruthy();
    expect(requestCount).toBe(2);
  });

  it("retries a failed guardian-list request and displays recovered records", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        permissions: ["students.profile.read", "guardians.profile.read"],
      },
    });
    const guardian = {
      id: "guardian-1",
      givenName: "Grace",
      middleName: null,
      familyName: "Njeri",
      email: "grace@example.test",
      phone: null,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    };
    let requestCount = 0;
    fetchMock.mockImplementation((input) => {
      if (!String(input).includes("/guardians?")) {
        return Promise.resolve(
          jsonResponse(200, { data: [], meta: { total: 0, limit: 25, offset: 0 } }),
        );
      }

      requestCount += 1;
      if (requestCount === 1) {
        return Promise.resolve(
          jsonResponse(503, {
            error: { message: "Guardian records are temporarily unavailable." },
          }),
        );
      }

      return Promise.resolve(
        jsonResponse(200, {
          data: [guardian],
          meta: { total: 1, limit: 25, offset: 0 },
        }),
      );
    });

    renderStudentsPage();

    fireEvent.click(screen.getByRole("button", { name: /^Guardians Directory/ }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Guardian records are temporarily unavailable.",
    );
    const guardiansTab = screen.getByRole("button", { name: /^Guardians Directory/ });
    expect(within(guardiansTab).getByText("Unavailable")).toBeTruthy();
    expect(within(guardiansTab).queryByText("0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading guardians" }));

    expect(await screen.findByRole("button", { name: "Grace Njeri" })).toBeTruthy();
    expect(requestCount).toBe(2);
  });

  it("announces guardian creation failures and preserves the entered values for retry", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        permissions: [
          "students.profile.read",
          "guardians.profile.read",
          "guardians.profile.manage",
        ],
      },
    });
    fetchMock.mockImplementation((_input, init) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(503, {
            error: { message: "Guardian records are temporarily unavailable." },
          }),
        );
      }

      return Promise.resolve(
        jsonResponse(200, {
          data: [],
          meta: { total: 0, limit: 25, offset: 0 },
        }),
      );
    });

    renderStudentsPage();
    fireEvent.click(screen.getByRole("button", { name: /^Guardians Directory/ }));
    fireEvent.click(await screen.findByRole("button", { name: "New Guardian" }));

    const givenName = screen.getByRole("textbox", { name: /Given name/ });
    const familyName = screen.getByRole("textbox", { name: /Family name/ });
    const phone = screen.getByRole("textbox", { name: /Phone number/ });
    fireEvent.change(givenName, { target: { value: "Grace" } });
    fireEvent.change(familyName, { target: { value: "Njeri" } });
    fireEvent.change(phone, { target: { value: "+254700000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Guardian" }));

    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("Guardian records are temporarily unavailable.");
    expect(error.getAttribute("aria-live")).toBe("assertive");
    expect((givenName as HTMLInputElement).value).toBe("Grace");
    expect((familyName as HTMLInputElement).value).toBe("Njeri");
    expect((phone as HTMLInputElement).value).toBe("+254700000000");
    expect(
      (screen.getByRole("button", { name: "Create Guardian" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("retries failed guardian profile history and reports when there are no revisions", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        permissions: ["students.profile.read", "guardians.profile.read"],
      },
    });

    const guardian = {
      id: "guardian-1",
      givenName: "Grace",
      middleName: null,
      familyName: "Njeri",
      email: "grace@example.test",
      phone: null,
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    };
    let historyRequestCount = 0;
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/guardians?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [guardian],
            meta: { total: 1, limit: 25, offset: 0 },
          }),
        );
      }

      if (url.includes("/guardians/guardian-1/profile-history")) {
        historyRequestCount += 1;
        if (historyRequestCount === 1) {
          return Promise.resolve(
            jsonResponse(503, {
              error: { message: "Guardian profile history is temporarily unavailable." },
            }),
          );
        }
        return Promise.resolve(jsonResponse(200, { data: [] }));
      }

      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { total: 0, limit: 25, offset: 0 } }),
      );
    });

    renderStudentsPage();
    fireEvent.click(screen.getByRole("button", { name: /^Guardians Directory/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Grace Njeri" }));

    expect(await screen.findByText("Guardian profile history is temporarily unavailable."))
      .toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading guardian history" }));

    expect(
      await screen.findByText("No profile revisions recorded for this guardian."),
    ).toBeTruthy();
    expect(historyRequestCount).toBe(2);
  });

  it("does not request or expose student and guardian records without read permissions", () => {
    useAuthMock.mockReturnValue({ school: { id: "school-1", permissions: [] } });

    renderStudentsPage();

    expect(screen.getByRole("alert").textContent).toContain(
      "Your school access does not include permission to read student or guardian records.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps student detail actions read-only without the corresponding permissions", async () => {
    renderStudentsPage();

    fireEvent.click(await screen.findByRole("button", { name: "Manage" }));
    expect(await screen.findByText("Personal Information")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Profile" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change Status" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Link Guardian" })).toBeNull();
    expect(
      screen.getByText("Guardian details require guardian-profile read permission."),
    ).toBeTruthy();
  });

  it("shows student mutation actions only with their matching permissions", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        permissions: [
          "students.profile.read",
          "students.profile.update",
          "students.profile.status",
          "students.guardian.manage",
          "guardians.profile.read",
        ],
      },
    });

    renderStudentsPage();

    fireEvent.click(await screen.findByRole("button", { name: "Manage" }));
    expect(await screen.findByRole("button", { name: "Edit Profile" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change Status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Link Guardian" })).toBeTruthy();
  });

  it("retries failed profile sections and shows their empty states after recovery", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        permissions: ["students.profile.read", "guardians.profile.read"],
      },
    });

    const requestCounts = new Map<string, number>();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/students?")) {
        return jsonResponse(200, {
          data: [student],
          meta: { total: 1, limit: 25, offset: 0 },
        });
      }

      if (url.includes("/guardians?")) {
        return jsonResponse(200, {
          data: [],
          meta: { total: 0, limit: 25, offset: 0 },
        });
      }

      const section = url.includes("/placements")
        ? "placements"
        : url.includes("/students/student-1/guardians")
          ? "guardians"
          : "profile-history";
      const attempts = (requestCounts.get(section) ?? 0) + 1;
      requestCounts.set(section, attempts);

      if (attempts === 1) {
        return jsonResponse(503, {
          error: {
            message:
              section === "profile-history"
                ? "Profile history is temporarily unavailable."
                : `${section === "guardians" ? "Linked guardians" : "Academic placements"} are temporarily unavailable.`,
          },
        });
      }

      return jsonResponse(200, section === "profile-history" ? { data: [] } : []);
    });

    renderStudentsPage();
    fireEvent.click(await screen.findByRole("button", { name: "Manage" }));

    expect(await screen.findByText("Academic placements are temporarily unavailable.")).toBeTruthy();
    expect(await screen.findByText("Linked guardians are temporarily unavailable.")).toBeTruthy();
    expect(await screen.findByText("Profile history is temporarily unavailable.")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading academic placements" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading linked guardians" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading profile history" }),
    );

    expect(
      await screen.findByText("No class placements recorded for this student."),
    ).toBeTruthy();
    expect(
      await screen.findByText("No guardians linked to this student yet."),
    ).toBeTruthy();
    expect(
      await screen.findByText("No profile revisions recorded for this student."),
    ).toBeTruthy();
    expect(requestCounts).toEqual(
      new Map([
        ["placements", 2],
        ["guardians", 2],
        ["profile-history", 2],
      ]),
    );
  });

  it("presents student placement dates and status without exposing an opaque placement ID", async () => {
    const placement = {
      id: "placement-id-not-for-display",
      studentId: student.id,
      academicYearId: "year-id",
      classId: "class-id",
      streamId: null,
      startedAt: "2026-09-01T10:00:00.000Z",
      endedAt: null,
    };

    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/students?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [student],
            meta: { total: 1, limit: 25, offset: 0 },
          }),
        );
      }

      if (url.includes("/placements")) {
        return Promise.resolve(jsonResponse(200, [placement]));
      }

      return Promise.resolve(
        jsonResponse(200, { data: [], meta: { total: 0, limit: 25, offset: 0 } }),
      );
    });

    renderStudentsPage();
    fireEvent.click(await screen.findByRole("button", { name: "Manage" }));

    expect(await screen.findByText("Current placement")).toBeTruthy();
    const placementRegion = screen.getByRole("region", { name: "Current placement" });
    expect(within(placementRegion).getByText("Active")).toBeTruthy();
    expect(screen.getByText("Started")).toBeTruthy();
    expect(screen.getByText("Ended")).toBeTruthy();
    expect(screen.getByText("Not ended")).toBeTruthy();
    expect(
      screen.getByText(
        "Class, stream, and academic-year names are not included in this placement record.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("placement-id-not-for-display")).toBeNull();
  });
});
