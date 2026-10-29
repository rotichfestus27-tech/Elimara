import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { AdmissionsPage } from "./admissions-page";

const authState = vi.hoisted(() => ({
  permissions: [
    "admissions.application.read",
    "admissions.application.create",
    "admissions.application.review",
    "admissions.application.admit",
  ],
}));

vi.mock("@/app/auth-provider", () => ({
  useAuth: () => ({ school: { id: "school-1", permissions: authState.permissions } }),
}));

const applications = [
  {
    id: "application-1",
    givenName: "Amina",
    middleName: null,
    familyName: "Njeri",
    dateOfBirth: "2012-05-14",
    status: "SUBMITTED",
    possibleDuplicate: false,
    guardians: [
      {
        givenName: "Grace",
        middleName: null,
        familyName: "Njeri",
        relationship: "Mother",
        authorizedAccess: true,
      },
    ],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
    submittedAt: "2026-09-01T10:00:00.000Z",
    reviewedAt: null,
    acceptedAt: null,
    rejectedAt: null,
    withdrawnAt: null,
    admittedAt: null,
    studentId: null,
  },
  {
    id: "application-2",
    givenName: "Brian",
    middleName: null,
    familyName: "Otieno",
    dateOfBirth: null,
    status: "ACCEPTED",
    possibleDuplicate: false,
    guardians: [],
    createdAt: "2026-09-02T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
    submittedAt: "2026-09-02T10:00:00.000Z",
    reviewedAt: "2026-09-02T10:00:00.000Z",
    acceptedAt: "2026-09-02T10:00:00.000Z",
    rejectedAt: null,
    withdrawnAt: null,
    admittedAt: null,
    studentId: null,
  },
];
const fetchMock = vi.fn<typeof fetch>();

function renderAdmissionsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AdmissionsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("AdmissionsPage backend integration", () => {
  beforeEach(() => {
    authState.permissions = [
      "admissions.application.read",
      "admissions.application.create",
      "admissions.application.review",
      "admissions.application.admit",
    ];
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: applications,
        meta: { total: applications.length, limit: 25, offset: 0 },
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads the school-scoped table and opens the selected application's details", async () => {
    renderAdmissionsPage();

    const selectApplicant = await screen.findByRole("button", {
      name: "View details for Brian Otieno",
    });
    fireEvent.click(selectApplicant);

    expect(screen.getByText("Applicant Details")).toBeTruthy();
    expect(screen.getAllByText("Brian Otieno").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Accepted").length).toBeGreaterThan(0);
    expect(selectApplicant.getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/schools/school-1/admission-applications?limit=25&offset=0&sortBy=createdAt&sortOrder=desc",
      expect.any(Object),
    );
  });

  it("retries an initial application-list failure and displays the recovered results", async () => {
    let requestCount = 0;
    fetchMock.mockImplementation(() => {
      requestCount += 1;
      if (requestCount === 1) {
        return Promise.resolve(
          jsonResponse(503, { error: { message: "Applications are temporarily unavailable." } }),
        );
      }

      return Promise.resolve(
        jsonResponse(200, {
          data: applications,
          meta: { total: applications.length, limit: 25, offset: 0 },
        }),
      );
    });

    renderAdmissionsPage();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Applications are temporarily unavailable.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry loading applications" }));

    expect(await screen.findByRole("button", { name: "View details for Amina Njeri" })).toBeTruthy();
    expect(requestCount).toBe(2);
  });

  it("preserves accessible table headers and a keyboard-operable details control", async () => {
    const { container } = renderAdmissionsPage();
    const table = await screen.findByRole("table", {
      name: "Admissions applications",
    });
    for (const header of [
      "Applicant",
      "Date of Birth",
      "Guardians",
      "Created",
      "Status",
      "Action",
    ]) {
      expect(within(table).getByRole("columnheader", { name: header })).toBeTruthy();
    }

    expect(container.querySelector(".overflow-x-auto table")).toBe(table);
    const selectApplicant = await screen.findByRole("button", {
      name: "View details for Amina Njeri",
    });
    expect(selectApplicant).toBeInstanceOf(HTMLButtonElement);
    expect(selectApplicant.getAttribute("aria-pressed")).toBe("false");
    selectApplicant.focus();
    expect(document.activeElement).toBe(selectApplicant);
    fireEvent.click(selectApplicant);
    expect(selectApplicant.getAttribute("aria-pressed")).toBe("true");
  });

  it("loads the next API page without implying the first page is the full directory", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const offset = new URL(url, window.location.origin).searchParams.get("offset");
      if (offset === "0") {
        return jsonResponse(200, {
          data: applications,
          meta: { total: 27, limit: 25, offset: 0 },
        });
      }
      return jsonResponse(200, {
        data: [applications[0]],
        meta: { total: 27, limit: 25, offset: 25 },
      });
    });

    renderAdmissionsPage();
    expect(await screen.findByText("Showing 1–2 of 27 applications.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Showing 26–26 of 27 applications.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("offset=25"),
      expect.any(Object),
    );
  });

  it("uses the admissions response limit and offset for pagination", async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      const offset = Number(new URL(url, window.location.origin).searchParams.get("offset") ?? 0);

      return Promise.resolve(
        jsonResponse(200, {
          data: applications,
          meta: { total: 27, limit: 10, offset },
        }),
      );
    });

    renderAdmissionsPage();

    expect(await screen.findByText("Showing 1–2 of 27 applications.")).toBeTruthy();
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Showing 11–12 of 27 applications.")).toBeTruthy();
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("limit=10&offset=10"),
      expect.any(Object),
    );
  });

  it("does not request or expose application records without read permission", () => {
    authState.permissions = [];
    fetchMock.mockClear();
    renderAdmissionsPage();

    expect(screen.getByRole("alert").textContent).toContain("does not include permission");
    expect(screen.queryByRole("button", { name: "New Application" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides application creation without create permission", async () => {
    authState.permissions = ["admissions.application.read"];
    renderAdmissionsPage();

    expect(await screen.findByRole("table", { name: "Admissions applications" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New Application" })).toBeNull();
  });

  it("does not load or offer existing guardians without guardian read permission", async () => {
    authState.permissions = ["admissions.application.read", "admissions.application.create"];
    renderAdmissionsPage();

    fireEvent.click(await screen.findByRole("button", { name: "New Application" }));

    expect(await screen.findByRole("dialog", { name: "New Admission Application" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Existing Guardian" })).toBeNull();
    expect(
      screen.getByText("Existing guardian selection requires guardian-profile read permission."),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("e.g. Grace")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/guardians?"))).toBe(
      false,
    );
  });

  it("announces application creation failures and preserves entered details for retry", async () => {
    fetchMock.mockImplementation((_input, init) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          jsonResponse(503, {
            error: { message: "Application drafts are temporarily unavailable." },
          }),
        );
      }

      return Promise.resolve(
        jsonResponse(200, {
          data: applications,
          meta: { total: applications.length, limit: 25, offset: 0 },
        }),
      );
    });

    renderAdmissionsPage();
    fireEvent.click(await screen.findByRole("button", { name: "New Application" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Amina"), {
      target: { value: "Amina" },
    });
    const familyNameInputs = screen.getAllByPlaceholderText("e.g. Otieno");
    fireEvent.change(familyNameInputs[0], {
      target: { value: "Applicant" },
    });
    fireEvent.change(familyNameInputs[1], { target: { value: "Njeri" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Grace"), {
      target: { value: "Grace" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. +254700000000"), {
      target: { value: "+254700000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Application" }));

    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("Application drafts are temporarily unavailable.");
    expect(error.getAttribute("aria-live")).toBe("assertive");
    expect((screen.getByPlaceholderText("e.g. Amina") as HTMLInputElement).value).toBe("Amina");
    expect((screen.getAllByPlaceholderText("e.g. Otieno")[0] as HTMLInputElement).value).toBe(
      "Applicant",
    );
    expect((screen.getAllByPlaceholderText("e.g. Otieno")[1] as HTMLInputElement).value).toBe(
      "Njeri",
    );
    expect((screen.getByPlaceholderText("e.g. Grace") as HTMLInputElement).value).toBe("Grace");
    expect(
      (screen.getByPlaceholderText("e.g. +254700000000") as HTMLInputElement).value,
    ).toBe("+254700000000");
    expect(
      (screen.getByRole("button", { name: "Create Application" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
