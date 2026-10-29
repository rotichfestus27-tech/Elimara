import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { AcademicsPage } from "./academics-page";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    school: { id: "school-1", name: "Authorized School", permissions: [] as string[] },
  })),
}));

vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));

const fetchMock = vi.fn<typeof fetch>();

function renderAcademicsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AcademicsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fetchMock.mockReset();
  useAuthMock.mockReturnValue({
    school: { id: "school-1", name: "Authorized School", permissions: [] },
  });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input) => {
    const pathname = new URL(String(input), window.location.origin).pathname;
    const data = pathname.endsWith("/academic-years")
      ? [
          {
            id: "year-1",
            name: "2026",
            startsOn: "2026-01-01",
            endsOn: "2026-12-31",
            status: "ACTIVE",
          },
        ]
      : [];
    return jsonResponse(200, {
      data,
      meta: { limit: 100, offset: 0, total: data.length },
    });
  });
});

describe("AcademicsPage permissions", () => {
  it("supports keyboard navigation through the academic tabs", () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["academics.configuration.read"],
      },
    });
    renderAcademicsPage();

    const academicYearsTab = screen.getByRole("tab", { name: "Academic years" });
    const termsTab = screen.getByRole("tab", { name: "Terms" });
    const classSubjectsTab = screen.getByRole("tab", { name: "Class subjects" });

    expect(academicYearsTab.tabIndex).toBe(0);
    expect(termsTab.tabIndex).toBe(-1);

    fireEvent.keyDown(academicYearsTab, { key: "ArrowRight" });
    expect(termsTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(termsTab);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(termsTab.id);

    fireEvent.keyDown(termsTab, { key: "End" });
    expect(classSubjectsTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(classSubjectsTab);

    fireEvent.keyDown(classSubjectsTab, { key: "ArrowRight" });
    expect(academicYearsTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(academicYearsTab);
  });

  it("does not load academic records or expose controls without read permission", () => {
    renderAcademicsPage();

    expect(screen.getByText("Academic configuration access unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add academic year" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows academic records as read-only without manage permission", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["academics.configuration.read"],
      },
    });
    renderAcademicsPage();

    expect(
      await screen.findByText(
        "Read-only: academic configuration management permission is required to make changes.",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("2026")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add academic year" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit 2026" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Deactivate 2026" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("enables configuration actions when the server returns manage permission", () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["academics.configuration.read", "academics.configuration.manage"],
      },
    });
    renderAcademicsPage();

    expect(screen.getByRole("button", { name: "Add academic year" })).toBeTruthy();
  });

  it("associates academic-year validation errors with the invalid field", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["academics.configuration.read", "academics.configuration.manage"],
      },
    });

    renderAcademicsPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add academic year" }));
    const form = (await screen.findByRole("button", { name: "Save" })).closest("form");
    if (!form) throw new Error("The academic-year form was not rendered.");

    fireEvent.submit(form);

    const nameInput = screen.getByLabelText("Name");
    const error = await screen.findByRole("alert");
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(nameInput.getAttribute("aria-describedby")).toBe(error.id);
    expect(error.textContent).toContain("Name is required.");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("submits an academic-year creation only once when the form is submitted repeatedly", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["academics.configuration.read", "academics.configuration.manage"],
      },
    });
    let resolveCreate!: (response: Response) => void;
    fetchMock.mockImplementation((input, init) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveCreate = resolve;
        });
      }

      const pathname = new URL(String(input), window.location.origin).pathname;
      const data = pathname.endsWith("/academic-years")
        ? [
            {
              id: "year-1",
              name: "2026",
              startsOn: "2026-01-01",
              endsOn: "2026-12-31",
              status: "ACTIVE",
            },
          ]
        : [];
      return Promise.resolve(
        jsonResponse(200, {
          data,
          meta: { limit: 100, offset: 0, total: data.length },
        }),
      );
    });

    renderAcademicsPage();
    fireEvent.click(await screen.findByRole("button", { name: "Add academic year" }));
    const form = (await screen.findByRole("button", { name: "Save" })).closest("form");
    if (!form) throw new Error("The academic-year form was not rendered.");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "2027" } });
    fireEvent.change(screen.getByLabelText("Starts on"), { target: { value: "2027-01-01" } });
    fireEvent.change(screen.getByLabelText("Ends on"), { target: { value: "2027-12-31" } });
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);

    resolveCreate(
      jsonResponse(201, {
        data: {
          id: "year-2",
          name: "2027",
          startsOn: "2027-01-01",
          endsOn: "2027-12-31",
          status: "ACTIVE",
        },
      }),
    );
  });

  it("retries a failed academic-years list and displays the recovered records", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["academics.configuration.read"],
      },
    });
    let yearListRequests = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/academic-years") && url.searchParams.get("status") !== "ACTIVE") {
        yearListRequests += 1;
        if (yearListRequests === 1) {
          return jsonResponse(503, {
            error: { message: "Academic years are temporarily unavailable." },
          });
        }
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

      return jsonResponse(200, { data: [], meta: { limit: 100, offset: 0, total: 0 } });
    });

    renderAcademicsPage();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Academic years are temporarily unavailable.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("2026")).toBeTruthy();
    expect(yearListRequests).toBe(2);
  });

  it("distinguishes a failed academic-year prerequisite from no configured years and retries", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["academics.configuration.read"],
      },
    });
    let activeYearRequests = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/academic-years") && url.searchParams.get("status") === "ACTIVE") {
        activeYearRequests += 1;
        if (activeYearRequests === 1) {
          return jsonResponse(503, {
            error: { message: "Academic-year options are temporarily unavailable." },
          });
        }
        return jsonResponse(200, {
          data: [
            {
              id: "year-1",
              name: "2026-27",
              startsOn: "2026-08-01",
              endsOn: "2027-07-31",
              status: "ACTIVE",
            },
          ],
          meta: { limit: 100, offset: 0, total: 1 },
        });
      }

      return jsonResponse(200, { data: [], meta: { limit: 100, offset: 0, total: 0 } });
    });

    renderAcademicsPage();
    fireEvent.click(screen.getByRole("tab", { name: "Terms" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Academic-year options are temporarily unavailable.",
    );
    expect(
      screen.queryByText("Create and activate an academic year first before managing terms."),
    ).toBeNull();
    expect(screen.getByRole("combobox", { name: "Academic year" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("combobox", { name: "Academic year" }).textContent).toContain(
      "Academic years unavailable",
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("No terms found for this academic year.")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Academic year" }).textContent).toContain(
      "2026-27 (2026-08-01 to 2027-07-31)",
    );
    expect(activeYearRequests).toBe(2);
  });

  it("distinguishes a failed class prerequisite from an empty class list and retries it", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["academics.configuration.read"],
      },
    });
    let classRequests = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/academic-years")) {
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

      if (url.pathname.endsWith("/classes") && url.searchParams.get("status") === "ACTIVE") {
        classRequests += 1;
        if (classRequests === 1) {
          return jsonResponse(503, {
            error: { message: "Classes are temporarily unavailable." },
          });
        }
        return jsonResponse(200, {
          data: [
            {
              id: "class-1",
              academicYearId: "year-1",
              name: "Grade 5",
              status: "ACTIVE",
            },
          ],
          meta: { limit: 100, offset: 0, total: 1 },
        });
      }

      return jsonResponse(200, { data: [], meta: { limit: 100, offset: 0, total: 0 } });
    });

    renderAcademicsPage();
    fireEvent.click(screen.getByRole("tab", { name: "Streams" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Classes are temporarily unavailable.",
    );
    expect(
      screen.queryByText(/No active classes are configured for this academic year/),
    ).toBeNull();
    expect(screen.getByRole("combobox", { name: "Class" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("No streams configured for this class.")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Class" }).textContent).toContain("Grade 5");
    expect(classRequests).toBe(2);
  });

  it("does not present an unresolved subject identifier as its name", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["academics.configuration.read"],
      },
    });
    const unresolvedSubjectId = "subject-id-with-no-active-subject-record";
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/academic-years")) {
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

      if (url.pathname.endsWith("/classes")) {
        return jsonResponse(200, {
          data: [
            {
              id: "class-1",
              academicYearId: "year-1",
              name: "Grade 5",
              status: "ACTIVE",
            },
          ],
          meta: { limit: 100, offset: 0, total: 1 },
        });
      }

      if (url.pathname.endsWith("/class-subjects")) {
        return jsonResponse(200, {
          data: [
            {
              id: "assignment-1",
              classId: "class-1",
              subjectId: unresolvedSubjectId,
              status: "INACTIVE",
            },
          ],
          meta: { limit: 100, offset: 0, total: 1 },
        });
      }

      return jsonResponse(200, { data: [], meta: { limit: 100, offset: 0, total: 0 } });
    });

    renderAcademicsPage();
    fireEvent.click(screen.getByRole("tab", { name: "Class subjects" }));

    expect(await screen.findByText("Subject name unavailable")).toBeTruthy();
    expect(screen.queryByText(unresolvedSubjectId)).toBeNull();
    expect(screen.getAllByText("Grade 5").length).toBeGreaterThan(0);
    expect(screen.getByText("inactive")).toBeTruthy();
  });
});
