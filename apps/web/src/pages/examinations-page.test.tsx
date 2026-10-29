import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { ExaminationsPage } from "./examinations-page";

const authState = vi.hoisted(() => ({ permissions: ["assessments.read"] as string[] }));

vi.mock("@/app/auth-provider", () => ({
  useAuth: () => ({
    school: { id: "school-1", name: "Elimara Academy", permissions: authState.permissions },
  }),
}));

const yearId = "11111111-1111-4111-8111-111111111111";
const termId = "22222222-2222-4222-8222-222222222222";
const secondTermId = "22222222-2222-4222-8222-222222222223";
const classId = "33333333-3333-4333-8333-333333333333";
const secondClassId = "33333333-3333-4333-8333-333333333334";
const streamId = "44444444-4444-4444-8444-444444444444";
const subjectId = "55555555-5555-4555-8555-555555555555";
const assignmentId = "66666666-6666-4666-8666-666666666666";
const gradingScaleId = "77777777-7777-4777-8777-777777777777";
const records = [
  {
    id: "assessment-1",
    academicYearId: yearId,
    termId,
    classId,
    streamId,
    classSubjectAssignmentId: assignmentId,
    subjectId,
    gradingScaleId,
    name: "Term 1 Mathematics",
    subjectName: "Mathematics",
    startsOn: "2026-10-01",
    endsOn: "2026-10-02",
    maximumScore: "100",
    status: "OPEN",
    eligibleCount: 20,
    enteredCount: 12,
    missingCount: 8,
  },
  {
    id: "assessment-2",
    academicYearId: yearId,
    termId: secondTermId,
    classId: secondClassId,
    streamId: null,
    classSubjectAssignmentId: assignmentId,
    subjectId,
    gradingScaleId,
    name: "Term 1 English",
    subjectName: "English",
    startsOn: "2026-10-05",
    endsOn: "2026-10-05",
    maximumScore: "100",
    status: "DRAFT",
    eligibleCount: 18,
    enteredCount: 0,
    missingCount: 18,
  },
];
const fetchMock = vi.fn<typeof fetch>();

function apiResponse(input: RequestInfo | URL, init?: RequestInit) {
  const requestUrl = new URL(String(input), window.location.origin);
  const method = init?.method ?? "GET";
  if (requestUrl.pathname.endsWith("/academic-years")) {
    return jsonResponse(200, {
      data: [
        {
          id: yearId,
          name: "2026",
          startsOn: "2026-01-01",
          endsOn: "2026-12-31",
          status: "ACTIVE",
        },
      ],
      meta: { limit: 100, offset: 0, total: 1 },
    });
  }
  if (requestUrl.pathname.endsWith("/grading-scales")) {
    return jsonResponse(200, {
      data: [{ id: gradingScaleId, name: "Standard", status: "ACTIVE" }],
    });
  }
  if (requestUrl.pathname.endsWith("/terms")) {
    return jsonResponse(200, {
      data: [
        {
          id: termId,
          academicYearId: yearId,
          name: "Term 1",
          startsOn: "2026-09-01",
          endsOn: "2026-12-20",
          status: "ACTIVE",
        },
      ],
      meta: { limit: 100, offset: 0, total: 1 },
    });
  }
  if (requestUrl.pathname.endsWith("/classes")) {
    return jsonResponse(200, {
      data: [{ id: classId, academicYearId: yearId, name: "Grade 6" }],
      meta: { limit: 100, offset: 0, total: 1 },
    });
  }
  if (requestUrl.pathname.endsWith("/streams")) {
    return jsonResponse(200, {
      data: [{ id: streamId, classId, name: "East" }],
      meta: { limit: 100, offset: 0, total: 1 },
    });
  }
  if (requestUrl.pathname.endsWith("/class-subjects")) {
    return jsonResponse(200, {
      data: [{ id: assignmentId, classId, subjectId }],
      meta: { limit: 100, offset: 0, total: 1 },
    });
  }
  if (requestUrl.pathname.endsWith("/subjects")) {
    return jsonResponse(200, {
      data: [{ id: subjectId, name: "Mathematics" }],
      meta: { limit: 100, offset: 0, total: 1 },
    });
  }
  if (requestUrl.pathname.endsWith("/assessments") && method === "POST") {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse(201, {
      data: {
        ...records[0],
        id: "88888888-8888-4888-8888-888888888888",
        ...body,
        status: "DRAFT",
      },
    });
  }
  if (requestUrl.pathname.endsWith("/assessments/assessment-1") && method === "PATCH") {
    return jsonResponse(200, { data: records[0] });
  }
  if (requestUrl.pathname.endsWith("/assessments/assessment-2/open") && method === "POST") {
    records[1].status = "OPEN";
    return jsonResponse(200, { data: records[1] });
  }
  if (
    requestUrl.pathname.endsWith("/assessments/assessment-1/submit-for-moderation") &&
    method === "POST"
  ) {
    records[0].status = "MODERATION";
    return jsonResponse(200, { data: records[0] });
  }
  if (requestUrl.pathname.endsWith("/assessments/assessment-1/finalize") && method === "POST") {
    records[0].status = "FINALIZED";
    return jsonResponse(200, { data: records[0] });
  }
  if (requestUrl.pathname.endsWith("/assessments/assessment-1/publish") && method === "POST") {
    records[0].status = "PUBLISHED";
    return jsonResponse(200, { data: records[0] });
  }
  if (requestUrl.pathname.endsWith("/report-card")) {
    return jsonResponse(200, {
      data: [
        {
          assessmentId: "assessment-1",
          assessmentName: "Term 1 Mathematics",
          termId,
          subjectId,
          subjectName: "Mathematics",
          startsOn: "2026-10-02",
          score: "85.0000",
          maximumScore: "100.0000",
          percentage: "85.0000",
          gradeCode: "A",
          gradeLabel: "Excellent",
        },
      ],
    });
  }
  if (requestUrl.pathname.endsWith("/students")) {
    return jsonResponse(200, {
      data: [
        {
          id: "student-1",
          admissionNumber: "ADM-001",
          givenName: "Amina",
          middleName: "Njeri",
          familyName: "Otieno",
        },
      ],
      meta: { limit: 100, offset: 0, total: 1 },
    });
  }
  if (requestUrl.pathname.endsWith("/assessments/assessment-1/marks")) {
    const completed = ["FINALIZED", "PUBLISHED"].includes(records[0].status);
    return jsonResponse(200, {
      data: [
        {
          id: "result-1",
          studentId: "student-1",
          studentAdmissionNumber: "ADM-001",
          studentGivenName: "Amina",
          studentFamilyName: "Otieno",
          score: "85.0000",
          maximumScore: "100.0000",
          percentage: "85.0000",
          gradeCode: "A",
          gradeLabel: "Excellent",
          enteredAt: "2026-10-02T10:00:00.000Z",
          updatedAt: "2026-10-02T10:00:00.000Z",
        },
        {
          id: "result-2",
          studentId: "student-2",
          studentAdmissionNumber: "ADM-002",
          studentGivenName: "Brian",
          studentFamilyName: "Kiptoo",
          score: completed ? "78.0000" : null,
          maximumScore: "100.0000",
          percentage: completed ? "78.0000" : null,
          gradeCode: completed ? "B" : null,
          gradeLabel: completed ? "Good" : null,
          enteredAt: completed ? "2026-10-02T10:05:00.000Z" : null,
          updatedAt: "2026-10-02T10:00:00.000Z",
        },
      ],
      meta: { limit: 100, offset: 0, total: 2, missingCount: completed ? 0 : 1 },
    });
  }
  if (requestUrl.pathname.endsWith("/assessments")) {
    const status = requestUrl.searchParams.get("status");
    const filtered = status ? records.filter((record) => record.status === status) : records;

    return jsonResponse(200, {
      data: filtered,
      meta: { limit: 100, offset: 0, total: filtered.length },
    });
  }
  return jsonResponse(404, { error: { message: "Unknown test endpoint." } });
}

function renderExaminationsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ExaminationsPage />
    </QueryClientProvider>,
  );
}

describe("ExaminationsPage", () => {
  beforeEach(() => {
    authState.permissions = ["assessments.read"];
    records[0].status = "OPEN";
    records[0].enteredCount = 12;
    records[0].missingCount = 8;
    records[1].status = "DRAFT";
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => apiResponse(input, init));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("does not request assessment data without the server-returned read permission", async () => {
    authState.permissions = [];
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/assessments")) {
        throw new Error("Assessment data was requested without read permission.");
      }
      return jsonResponse(404, { error: { message: "Not found" } });
    });

    renderExaminationsPage();

    expect(await screen.findByText("Assessment access unavailable")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/assessments"))).toBe(
      false,
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows available API fields and preserves result-completion counts", async () => {
    renderExaminationsPage();

    expect(
      await screen.findByRole("heading", { name: "Term 1 Mathematics" }, { timeout: 10_000 }),
    ).toBeTruthy();
    expect(screen.getByText("Mathematics")).toBeTruthy();
    expect(screen.getAllByText(classId).length).toBeGreaterThan(0);
    expect(screen.getAllByText(streamId).length).toBeGreaterThan(0);
    expect(screen.getAllByText(termId).length).toBeGreaterThan(0);
    expect(screen.getByText("Oct 1, 2026 – Oct 2, 2026")).toBeTruthy();
    expect(screen.getByText("12 / 20")).toBeTruthy();
    expect(screen.getByText("8", { selector: "span" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/schools/school-1/assessments?limit=100&offset=0",
      expect.any(Object),
    );
  });

  it("filters loaded records by search, class, and academic term", async () => {
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "English" },
    });
    expect(screen.getByRole("heading", { name: "Term 1 English" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Term 1 Mathematics" })).toBeNull();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Class" }), {
      target: { value: classId },
    });
    expect(screen.getByRole("heading", { name: "Term 1 Mathematics" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Term 1 English" })).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "Academic term" }), {
      target: { value: secondTermId },
    });
    expect(screen.getByText("No matching assessments")).toBeTruthy();
  });

  it("uses the supported server-side status filter", async () => {
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.change(screen.getByRole("combobox", { name: "Assessment status" }), {
      target: { value: "DRAFT" },
    });

    expect(await screen.findByRole("heading", { name: "Term 1 English" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Term 1 Mathematics" })).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/schools/school-1/assessments?limit=100&offset=0&status=DRAFT",
      expect.any(Object),
    );
  });

  it("clears local class and term filters when the server-side status changes", async () => {
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.change(screen.getByRole("combobox", { name: "Class" }), {
      target: { value: classId },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Academic term" }), {
      target: { value: termId },
    });

    fireEvent.change(screen.getByRole("combobox", { name: "Assessment status" }), {
      target: { value: "DRAFT" },
    });

    expect(await screen.findByRole("heading", { name: "Term 1 English" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Class" })).toHaveProperty("value", "all");
    expect(screen.getByRole("combobox", { name: "Academic term" })).toHaveProperty(
      "value",
      "all",
    );
  });

  it("shows an honest empty state when the API returns no assessments", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(200, { data: [], meta: { limit: 100, offset: 0, total: 0 } }),
    );
    renderExaminationsPage();

    expect(await screen.findByText("No assessments found")).toBeTruthy();
  });

  it("distinguishes permission denial from retryable failures", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(403, {
        error: { code: "FORBIDDEN", message: "Not permitted", requestId: "request-1" },
      }),
    );
    renderExaminationsPage();

    expect(await screen.findByText("Assessment access denied")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("offers retry after a failed request", async () => {
    fetchMock
      .mockImplementationOnce(async () =>
        jsonResponse(500, {
          error: { code: "INTERNAL_ERROR", message: "Request failed", requestId: "request-1" },
        }),
      )
      .mockImplementation(async (input, init) => apiResponse(input, init));
    renderExaminationsPage();

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("heading", { name: "Term 1 Mathematics" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("hides assessment creation while the assessment list read has failed", async () => {
    authState.permissions = ["assessments.read", "assessments.manage"];
    fetchMock.mockImplementation(async () =>
      jsonResponse(500, {
        error: { code: "INTERNAL_ERROR", message: "Request failed", requestId: "request-1" },
      }),
    );
    renderExaminationsPage();

    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create assessment" })).toBeNull();
    expect(screen.getByText("Assessments could not be loaded. Please try again.")).toBeTruthy();
  });

  it("hides assessment mutation controls without the server-returned manage permission", async () => {
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    expect(screen.queryByRole("button", { name: "Create assessment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open assessment" })).toBeNull();
    expect(
      screen.getByText("Read-only: assessment management permission required to open."),
    ).toBeTruthy();
  });

  it("opens a draft only after confirmation and refreshes the assessment status", async () => {
    authState.permissions = ["assessments.read", "assessments.manage"];
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    await screen.findByRole("heading", { name: "Term 1 English" });
    fireEvent.click(screen.getByRole("button", { name: "Open assessment" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/moves this draft into the mark-entry phase/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Open assessment" }));

    expect(await screen.findByText("Assessment opened for mark entry.")).toBeTruthy();
    expect(await screen.findAllByText("Open", { selector: "p.font-semibold" })).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/schools/school-1/assessments/assessment-2/open",
      expect.objectContaining({ method: "POST", body: undefined }),
    );
  });

  it("explains a server-denied lifecycle action without changing the assessment status", async () => {
    authState.permissions = ["assessments.read", "assessments.manage"];
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/assessments/assessment-2/open") && init?.method === "POST") {
        return jsonResponse(403, {
          error: { code: "FORBIDDEN", message: "The assessment change is not permitted." },
        });
      }
      return apiResponse(input, init);
    });
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    await screen.findByRole("heading", { name: "Term 1 English" });
    fireEvent.click(screen.getByRole("button", { name: "Open assessment" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Open assessment" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "The server denied this action. Your current school permissions may not allow it.",
    );
    expect(screen.getByText("Draft", { selector: "p.font-semibold" })).toBeTruthy();
  });

  it("submits an open assessment for review after confirmation and refreshes its status", async () => {
    authState.permissions = ["assessments.read", "results.moderate"];
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/does not provide a separate reviewer assignment/),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit for review" }));

    expect(await screen.findByText("Assessment submitted for review.")).toBeTruthy();
    expect(await screen.findByText("Submitted for review")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/schools/school-1/assessments/assessment-1/submit-for-moderation",
      expect.objectContaining({ method: "POST", body: undefined }),
    );
  });

  it("does not show lifecycle actions without the matching server-returned permissions", async () => {
    authState.permissions = ["assessments.read"];
    records[0].status = "MODERATION";
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Finalize results" })).toBeNull();
    expect(screen.getByRole("button", { name: "View submitted results" })).toBeTruthy();
  });

  it("shows backend transition failures and preserves the assessment status", async () => {
    authState.permissions = ["assessments.read", "results.moderate"];
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/submit-for-moderation") && init?.method === "POST") {
        return jsonResponse(409, {
          error: { code: "ASSESSMENT_CONFLICT", message: "The assessment cannot be submitted." },
        });
      }
      return apiResponse(input, init);
    });
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit for review" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "The assessment cannot be submitted.",
    );
    expect(screen.getByText("Open", { selector: "p" })).toBeTruthy();
  });

  it("disables the confirmation action while a transition is pending", async () => {
    authState.permissions = ["assessments.read", "results.moderate"];
    let resolveTransition: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/submit-for-moderation") && init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveTransition = resolve;
        });
      }
      return apiResponse(input, init);
    });
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit for review" }));

    const pendingButton = await within(dialog).findByRole("button", { name: "Saving..." });
    expect(pendingButton.hasAttribute("disabled")).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith("/assessments/assessment-1/submit-for-moderation"),
      ),
    ).toHaveLength(1);

    records[0].status = "MODERATION";
    resolveTransition?.(jsonResponse(200, { data: records[0] }));
    expect(await screen.findByText("Assessment submitted for review.")).toBeTruthy();
  });

  it("shows moderated results only to readers and labels the API's roster-wide scope", async () => {
    authState.permissions = ["assessments.read"];
    records[0].status = "MODERATION";
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "View submitted results" }));

    expect(await screen.findByText("Amina Otieno")).toBeTruthy();
    expect(screen.getByText("85.0000 / 100.0000")).toBeTruthy();
    expect(screen.getByText("85.0000%")).toBeTruthy();
    const missingResultRow = screen.getByRole("row", { name: /Brian Kiptoo/ });
    expect(within(missingResultRow).getByText("Missing")).toBeTruthy();
    expect(within(missingResultRow).getAllByText("—")).toHaveLength(2);
    expect(screen.getByText(/full roster for this school assessment/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/schools/school-1/assessments/assessment-1/marks?limit=100&offset=0",
      expect.any(Object),
    );
  });

  it("allows authorized readers to view current results while an assessment is open", async () => {
    authState.permissions = ["assessments.read"];
    records[0].status = "OPEN";
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "View current results" }));

    expect(await screen.findByText("Current results")).toBeTruthy();
    expect(screen.getByText("Amina Otieno")).toBeTruthy();
    expect(screen.getByText("Missing")).toBeTruthy();
    expect(screen.getByText(/full roster for this school assessment/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Enter|Edit|Correct mark/ })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/schools/school-1/assessments/assessment-1/marks?limit=100&offset=0",
      expect.any(Object),
    );
  });

  it("preserves a returned grade code when the optional grade label is absent", async () => {
    authState.permissions = ["assessments.read"];
    records[0].status = "MODERATION";
    fetchMock.mockImplementation(async (input, init) => {
      const response = await apiResponse(input, init);
      if (
        new URL(String(input), window.location.origin).pathname.endsWith(
          "/assessments/assessment-1/marks",
        )
      ) {
        const body = (await response.json()) as {
          data: Array<Record<string, unknown>>;
          meta: Record<string, unknown>;
        };
        body.data[0].gradeLabel = null;
        return jsonResponse(200, body);
      }
      return response;
    });
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "View submitted results" }));

    const resultRow = await screen.findByRole("row", { name: /Amina Otieno/ });
    expect(within(resultRow).getByText("A")).toBeTruthy();
  });

  it("retries an empty results page when response metadata reports eligible students", async () => {
    authState.permissions = ["assessments.read"];
    records[0].status = "MODERATION";
    let returnEmptyPage = true;
    fetchMock.mockImplementation(async (input, init) => {
      if (
        new URL(String(input), window.location.origin).pathname.endsWith(
          "/assessments/assessment-1/marks",
        ) &&
        returnEmptyPage
      ) {
        return jsonResponse(200, {
          data: [],
          meta: { limit: 100, offset: 0, total: 2, missingCount: 1 },
        });
      }
      return apiResponse(input, init);
    });
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "View submitted results" }));

    expect(
      await screen.findByText(/API reports 2 eligible students/),
    ).toBeTruthy();
    returnEmptyPage = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Amina Otieno")).toBeTruthy();
  });

  it("does not report an empty roster when metadata reports missing marks", async () => {
    authState.permissions = ["assessments.read"];
    records[0].status = "MODERATION";
    fetchMock.mockImplementation(async (input, init) => {
      if (
        new URL(String(input), window.location.origin).pathname.endsWith(
          "/assessments/assessment-1/marks",
        )
      ) {
        return jsonResponse(200, {
          data: [],
          meta: { limit: 100, offset: 0, total: 0, missingCount: 2 },
        });
      }
      return apiResponse(input, init);
    });
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "View submitted results" }));

    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
    expect(
      screen.getByText(/0 eligible students and 2 missing marks/),
    ).toBeTruthy();
    expect(screen.queryByText("No assessment results")).toBeNull();
  });

  it("finalizes a complete moderated assessment after confirmation", async () => {
    authState.permissions = ["assessments.read", "results.finalize"];
    records[0].status = "MODERATION";
    records[0].enteredCount = 20;
    records[0].missingCount = 0;
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "Finalize results" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Finalize results" }));

    expect(await screen.findByText("Assessment results finalized.")).toBeTruthy();
    expect(screen.getAllByText("Finalized").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/schools/school-1/assessments/assessment-1/finalize",
      expect.objectContaining({ method: "POST", body: undefined }),
    );
  });

  it("publishes finalized results after confirmation and displays the API status", async () => {
    authState.permissions = ["assessments.read", "results.publish"];
    records[0].status = "FINALIZED";
    records[0].enteredCount = 20;
    records[0].missingCount = 0;
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "Publish results" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish results" }));

    expect(await screen.findByText("Assessment published. Status: PUBLISHED.")).toBeTruthy();
    expect(screen.getAllByText("Published").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/schools/school-1/assessments/assessment-1/publish",
      expect.objectContaining({ method: "POST", body: undefined }),
    );
  });

  it("does not claim publication when the API response remains finalized", async () => {
    authState.permissions = ["assessments.read", "results.publish"];
    records[0].status = "FINALIZED";
    records[0].enteredCount = 20;
    records[0].missingCount = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/assessments/assessment-1/publish") && init?.method === "POST") {
        return jsonResponse(200, { data: records[0] });
      }
      return apiResponse(input, init);
    });
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "Publish results" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Publish results",
    }));

    expect(
      await screen.findByText(/not the expected PUBLISHED.*verify its current state/),
    ).toBeTruthy();
    expect(screen.queryByText("Assessment published.")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("displays finalized results from the existing assessment result endpoint", async () => {
    authState.permissions = ["assessments.read"];
    records[0].status = "FINALIZED";
    records[0].enteredCount = 20;
    records[0].missingCount = 0;
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "View finalized results" }));

    expect(await screen.findByText("Amina Otieno")).toBeTruthy();
    expect(screen.getByText("Brian Kiptoo")).toBeTruthy();
    expect(screen.getByText("78.0000 / 100.0000")).toBeTruthy();
    expect(screen.getByText("Finalized results")).toBeTruthy();
  });

  it("hides publication action without the publish permission", async () => {
    authState.permissions = ["assessments.read"];
    records[0].status = "FINALIZED";
    records[0].enteredCount = 20;
    records[0].missingCount = 0;
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    expect(screen.queryByRole("button", { name: "Publish results" })).toBeNull();
    expect(screen.getByText("Read-only: publication permission required.")).toBeTruthy();
  });

  it("withholds publication while the opened result roster is unavailable", async () => {
    authState.permissions = ["assessments.read", "results.publish"];
    records[0].status = "FINALIZED";
    records[0].enteredCount = 20;
    records[0].missingCount = 0;
    fetchMock.mockImplementation(async (input, init) => {
      if (
        new URL(String(input), window.location.origin).pathname.endsWith(
          "/assessments/assessment-1/marks",
        )
      ) {
        return jsonResponse(500, {
          error: {
            code: "INTERNAL_ERROR",
            message: "Results temporarily unavailable.",
            requestId: "request-1",
          },
        });
      }
      return apiResponse(input, init);
    });
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "View finalized results" }));

    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish results" })).toBeNull();
    expect(
      screen.getByText("Publication is unavailable until the result roster can be loaded."),
    ).toBeTruthy();
  });

  it("loads and prints a staff-selected report card from published API data", async () => {
    authState.permissions = [
      "assessments.read",
      "students.profile.read",
      "academics.configuration.read",
    ];
    vi.stubGlobal("print", vi.fn());
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Student report card" });
    expect(await screen.findByRole("option", { name: /ADM-001 — Amina Njeri Otieno/ })).toBeTruthy();
    await screen.findByRole("option", { name: /2026/ });
    await screen.findByRole("option", { name: /Term 1/ });
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "student-1" } });
    fireEvent.change(screen.getByLabelText("Academic year"), { target: { value: yearId } });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: termId } });

    expect(
      await screen.findByRole("table", { name: "Published report-card assessment results" }),
    ).toBeTruthy();
    expect(screen.getByText("Amina Njeri Otieno · ADM-001")).toBeTruthy();
    expect(screen.getAllByText("Term 1 Mathematics").length).toBeGreaterThan(0);
    expect(screen.getByText("85.0000 / 100.0000")).toBeTruthy();
    expect(screen.getByText("85.0000%")).toBeTruthy();
    expect(screen.getByText("A — Excellent")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/schools/school-1/students/student-1/report-card?academicYearId=${yearId}&termId=${termId}`,
      expect.any(Object),
    );

    fireEvent.click(screen.getByRole("button", { name: "Print report card" }));
    expect(window.print).toHaveBeenCalledOnce();
  });

  it("does not expose report-card selectors without student and period read permissions", async () => {
    authState.permissions = ["assessments.read"];
    renderExaminationsPage();

    expect(await screen.findByText("Report-card access unavailable")).toBeTruthy();
    expect(screen.queryByLabelText("Student")).toBeNull();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/report-card"))).toBe(
      false,
    );
  });

  it("shows an empty state when the selected report card has no published results", async () => {
    authState.permissions = [
      "assessments.read",
      "students.profile.read",
      "academics.configuration.read",
    ];
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes("/report-card")) return jsonResponse(200, { data: [] });
      return apiResponse(input, init);
    });
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Student report card" });
    await screen.findByRole("option", { name: /ADM-001/ });
    await screen.findByRole("option", { name: /2026/ });
    await screen.findByRole("option", { name: /Term 1/ });
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "student-1" } });
    fireEvent.change(screen.getByLabelText("Academic year"), { target: { value: yearId } });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: termId } });

    expect(await screen.findByText("No published results")).toBeTruthy();
  });

  it("reports zero students accurately when no student records match", async () => {
    authState.permissions = [
      "assessments.read",
      "students.profile.read",
      "academics.configuration.read",
    ];
    fetchMock.mockImplementation(async (input, init) => {
      if (new URL(String(input), window.location.origin).pathname.endsWith("/students")) {
        return jsonResponse(200, {
          data: [],
          meta: { limit: 100, offset: 0, total: 0 },
        });
      }
      return apiResponse(input, init);
    });
    renderExaminationsPage();

    expect(await screen.findByText("No students available")).toBeTruthy();
    expect(screen.getByText("Students 0 of 0")).toBeTruthy();
    expect(screen.queryByText("Students 1–0 of 0")).toBeNull();
  });

  it("shows a report-card permission denial returned by the backend", async () => {
    authState.permissions = [
      "assessments.read",
      "students.profile.read",
      "academics.configuration.read",
    ];
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes("/report-card")) {
        return jsonResponse(403, {
          error: { code: "FORBIDDEN", message: "Not permitted" },
        });
      }
      return apiResponse(input, init);
    });
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Student report card" });
    await screen.findByRole("option", { name: /ADM-001/ });
    await screen.findByRole("option", { name: /2026/ });
    await screen.findByRole("option", { name: /Term 1/ });
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "student-1" } });
    fireEvent.change(screen.getByLabelText("Academic year"), { target: { value: yearId } });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: termId } });

    expect(await screen.findByText("Report-card access denied")).toBeTruthy();
  });

  it("offers retry when report-card retrieval fails", async () => {
    authState.permissions = [
      "assessments.read",
      "students.profile.read",
      "academics.configuration.read",
    ];
    let failReportOnce = true;
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes("/report-card") && failReportOnce) {
        failReportOnce = false;
        return jsonResponse(500, { error: { code: "INTERNAL_ERROR", message: "Try again" } });
      }
      return apiResponse(input, init);
    });
    renderExaminationsPage();

    await screen.findByRole("heading", { name: "Student report card" });
    await screen.findByRole("option", { name: /ADM-001/ });
    await screen.findByRole("option", { name: /2026/ });
    await screen.findByRole("option", { name: /Term 1/ });
    fireEvent.change(screen.getByLabelText("Student"), { target: { value: "student-1" } });
    fireEvent.change(screen.getByLabelText("Academic year"), { target: { value: yearId } });
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: termId } });

    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("table", { name: "Published report-card assessment results" }),
    ).toBeTruthy();
  });

  it("creates an assessment with only fields accepted by the API and refreshes the list", async () => {
    authState.permissions = [
      "assessments.read",
      "assessments.manage",
      "academics.configuration.read",
    ];
    renderExaminationsPage();
    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "Create assessment" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(await within(dialog).findByLabelText("Assessment name"), {
      target: { value: "Term 2 Mathematics" },
    });
    fireEvent.change(within(dialog).getByLabelText("Term"), { target: { value: termId } });
    fireEvent.change(within(dialog).getByLabelText("Class"), { target: { value: classId } });
    fireEvent.change(await within(dialog).findByLabelText("Assigned subject"), {
      target: { value: assignmentId },
    });
    fireEvent.change(within(dialog).getByLabelText("Grading scale"), {
      target: { value: gradingScaleId },
    });
    fireEvent.change(within(dialog).getByLabelText("Maximum score"), { target: { value: "80" } });
    fireEvent.change(within(dialog).getByLabelText("Start date"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.change(within(dialog).getByLabelText("End date"), {
      target: { value: "2026-10-11" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schedule assessment" }));

    expect(await screen.findByText("Assessment scheduled.")).toBeTruthy();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/schools/school-1/assessments") &&
        (init?.method ?? "GET") === "POST",
    );
    expect(createCall).toBeTruthy();
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      academicYearId: yearId,
      termId,
      classId,
      classSubjectAssignmentId: assignmentId,
      gradingScaleId,
      name: "Term 2 Mathematics",
      startsOn: "2026-10-10",
      endsOn: "2026-10-11",
      maximumScore: "80",
    });
    expect(JSON.stringify(JSON.parse(String(createCall?.[1]?.body)))).not.toContain("type");
  });

  it("focuses the first invalid field and associates its validation message", async () => {
    authState.permissions = [
      "assessments.read",
      "assessments.manage",
      "academics.configuration.read",
    ];
    renderExaminationsPage();
    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "Create assessment" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByRole("button", { name: "Schedule assessment" }));

    const nameInput = within(dialog).getByLabelText("Assessment name");
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(nameInput.getAttribute("aria-describedby")).toBe("assessment-name-error");
    expect(document.activeElement).toBe(nameInput);
  });

  it("edits only draft assessments through the supported PATCH operation", async () => {
    authState.permissions = [
      "assessments.read",
      "assessments.manage",
      "academics.configuration.read",
    ];
    records[0].status = "DRAFT";
    renderExaminationsPage();
    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "Edit Term 1 Mathematics" }));
    const dialog = await screen.findByRole("dialog");
    const nameInput = await within(dialog).findByLabelText("Assessment name");
    fireEvent.change(nameInput, { target: { value: "Updated Mathematics Assessment" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft changes" }));

    expect(await screen.findByText("Draft assessment updated.")).toBeTruthy();
    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/schools/school-1/assessments/assessment-1") &&
        init?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      academicYearId: yearId,
      termId,
      classId,
      classSubjectAssignmentId: assignmentId,
      gradingScaleId,
      name: "Updated Mathematics Assessment",
      startsOn: "2026-10-01",
      endsOn: "2026-10-02",
      maximumScore: "100",
    });
  });

  it("shows backend validation issues without losing the form", async () => {
    authState.permissions = [
      "assessments.read",
      "assessments.manage",
      "academics.configuration.read",
    ];
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/assessments") && init?.method === "POST") {
        return jsonResponse(400, {
          error: {
            code: "VALIDATION_FAILED",
            message: "The request is invalid.",
            issues: [{ path: "startsOn", message: "Date is outside the selected term." }],
          },
        });
      }
      return apiResponse(input, init);
    });
    renderExaminationsPage();
    await screen.findByRole("heading", { name: "Term 1 Mathematics" });
    fireEvent.click(screen.getByRole("button", { name: "Create assessment" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(await within(dialog).findByLabelText("Assessment name"), {
      target: { value: "Term 2 Mathematics" },
    });
    fireEvent.change(within(dialog).getByLabelText("Term"), { target: { value: termId } });
    fireEvent.change(within(dialog).getByLabelText("Class"), { target: { value: classId } });
    fireEvent.change(await within(dialog).findByLabelText("Assigned subject"), {
      target: { value: assignmentId },
    });
    fireEvent.change(within(dialog).getByLabelText("Grading scale"), {
      target: { value: gradingScaleId },
    });
    fireEvent.change(within(dialog).getByLabelText("Maximum score"), { target: { value: "80" } });
    fireEvent.change(within(dialog).getByLabelText("Start date"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.change(within(dialog).getByLabelText("End date"), {
      target: { value: "2026-10-11" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schedule assessment" }));

    expect(await screen.findByText(/Date is outside the selected term\./)).toBeTruthy();
    expect(within(dialog).getByLabelText("Assessment name")).toBeTruthy();
  });
});
