import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { superadminNavigationItems } from "@/config/superadmin-navigation";
import { jsonResponse, noContentResponse } from "@/test-utils/mock-response";
import { PlatformAuditPage } from "./platform-audit-page";
import { PlatformPlansPage } from "./platform-plans-page";
import { PlatformSecurityPage } from "./platform-security-page";
import { PlatformSettingsPage } from "./platform-settings-page";
import { PlatformUsersPage } from "./platform-users-page";
import { SuperadminOverviewPage } from "./superadmin-overview-page";
import { SuperadminSchoolsPage } from "./superadmin-schools-page";

const fetchMock = vi.fn<typeof fetch>();

function renderPage(page: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{page}</QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("platform dashboards", () => {
  it("renders live summary and recent audit response data", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/platform/summary")) {
        return jsonResponse(200, {
          data: {
            schools: { ACTIVE: 7, SUSPENDED: 2, CLOSED: 1 },
            activePlans: 3,
            activeSubscriptions: 5,
          },
        });
      }
      if (url.endsWith("/platform/audit-events?limit=5&offset=0")) {
        return jsonResponse(200, {
          data: [
            {
              id: "event-1",
              actorUserId: "operator-1",
              eventType: "PLATFORM_SCHOOL_UPDATED",
              outcome: "SUCCESS",
              requestId: "request-1",
              occurredAt: "2026-10-24T10:00:00.000Z",
              metadata: { changedFields: ["name"] },
            },
          ],
          meta: { limit: 5, offset: 0, total: 1 },
        });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderPage(<SuperadminOverviewPage />);

    expect(await screen.findByText("PLATFORM_SCHOOL_UPDATED")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(
      screen.getByText(
        "Live counts from the protected platform summary API. No demo figures are shown.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /Manage schools/ }).getAttribute("href")).toBe(
      "/superadmin/schools",
    );
    expect(screen.getByRole("link", { name: /Plans & subscriptions/ }).getAttribute("href")).toBe(
      "/superadmin/subscriptions",
    );
    expect(screen.getByRole("link", { name: /Audit events/ }).getAttribute("href")).toBe(
      "/superadmin/audit-logs",
    );
    expect(screen.getByRole("link", { name: /^Security/ }).getAttribute("href")).toBe(
      "/superadmin/security",
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/platform/summary", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/platform/audit-events?limit=5&offset=0",
      expect.any(Object),
    );
  });

  it("shows loading, empty activity, and errors without substituting demo metrics", async () => {
    let resolveSummary: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith("/platform/summary")) {
        return new Promise<Response>((resolve) => {
          resolveSummary = resolve;
        });
      }
      if (url.endsWith("/platform/audit-events?limit=5&offset=0")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [],
            meta: { limit: 5, offset: 0, total: 0 },
          }),
        );
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderPage(<SuperadminOverviewPage />);

    const metrics = screen.getByRole("region", { name: "Platform metrics" });
    expect(within(metrics).getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Refreshing overview..." }).hasAttribute("disabled"),
    ).toBe(true);
    expect(await screen.findByText("No recent activity")).toBeTruthy();

    resolveSummary?.(
      jsonResponse(503, {
        error: { code: "SERVICE_UNAVAILABLE", message: "Platform summary is unavailable." },
      }),
    );

    expect(await within(metrics).findByRole("alert")).toBeTruthy();
    expect(
      within(metrics).getByText("This information could not be loaded. Please try again."),
    ).toBeTruthy();
    expect(within(metrics).queryByText("7")).toBeNull();
    expect(
      within(metrics).getByText(
        "Live counts from the protected platform summary API. No demo figures are shown.",
      ),
    ).toBeTruthy();
  });

  it("loads and filters real school tenant metadata", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/platform/schools?")) {
        return jsonResponse(200, {
          data: [
            {
              id: "school-1",
              name: "North School",
              contactEmail: "office@example.test",
              contactPhone: null,
              status: "ACTIVE",
              createdAt: "2026-10-20T00:00:00.000Z",
              updatedAt: "2026-10-20T00:00:00.000Z",
            },
          ],
          meta: { limit: 25, offset: 0, total: 1 },
        });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderPage(<SuperadminSchoolsPage />);

    expect(await screen.findByText("North School")).toBeTruthy();
    expect(screen.getByRole("link", { name: "North School" }).getAttribute("href")).toBe(
      "/superadmin/schools/school-1",
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search schools" }), {
      target: { value: "North" },
    });
    expect(await screen.findByText("North School")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/platform/schools?limit=25&offset=0&search=North"),
      ),
    ).toBe(true);
  });

  it("filters schools by supported status and paginates server results", async () => {
    let listRequest = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/platform/schools?")) {
        listRequest += 1;
        if (url.includes("status=SUSPENDED")) {
          return jsonResponse(200, {
            data: [
              {
                id: "school-suspended",
                name: "Suspended School",
                contactEmail: null,
                contactPhone: null,
                status: "SUSPENDED",
                createdAt: "2026-10-20T00:00:00.000Z",
                updatedAt: "2026-10-20T00:00:00.000Z",
              },
            ],
            meta: { limit: 25, offset: 0, total: 26 },
          });
        }
        return jsonResponse(200, {
          data: [
            {
              id: `school-page-${listRequest}`,
              name: `School page ${listRequest}`,
              contactEmail: null,
              contactPhone: null,
              status: "ACTIVE",
              createdAt: "2026-10-20T00:00:00.000Z",
              updatedAt: "2026-10-20T00:00:00.000Z",
            },
          ],
          meta: { limit: 25, offset: url.includes("offset=25") ? 25 : 0, total: 50 },
        });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderPage(<SuperadminSchoolsPage />);
    expect(await screen.findByText("School page 1")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("School status"), { target: { value: "SUSPENDED" } });
    expect(await screen.findByText("Suspended School")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/platform/schools?limit=25&offset=0&status=SUSPENDED"),
      ),
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("School status"), { target: { value: "all" } });
    expect(await screen.findByText("School page 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("School page 4")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/platform/schools?limit=25&offset=25"),
      ),
    ).toBe(true);
    expect(screen.getByText("Showing 26–50 of 50 schools")).toBeTruthy();
  });

  it("shows a retryable list error and the empty state after recovery", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable")).mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        meta: { limit: 25, offset: 0, total: 0 },
      }),
    );

    renderPage(<SuperadminSchoolsPage />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No schools")).toBeTruthy();
    expect(screen.getByText("0 schools")).toBeTruthy();
  });

  it("creates a suspended school through the platform API and reports success", async () => {
    let createdSchool: {
      id: string;
      name: string;
      contactEmail: string | null;
      contactPhone: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
    } | null = null;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/platform/schools?")) {
        return jsonResponse(200, {
          data: createdSchool ? [createdSchool] : [],
          meta: { limit: 25, offset: 0, total: createdSchool ? 1 : 0 },
        });
      }
      if (url.endsWith("/platform/schools") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          name: string;
          contactEmail?: string;
          contactPhone?: string;
        };
        createdSchool = {
          id: "school-2",
          name: body.name,
          contactEmail: body.contactEmail ?? null,
          contactPhone: body.contactPhone ?? null,
          status: "SUSPENDED",
          createdAt: "2026-10-25T00:00:00.000Z",
          updatedAt: "2026-10-25T00:00:00.000Z",
        };
        return jsonResponse(201, { data: createdSchool });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderPage(<SuperadminSchoolsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add school" }));
    fireEvent.change(screen.getByLabelText("School name"), {
      target: { value: "New School" },
    });
    fireEvent.change(screen.getByLabelText("Contact email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create suspended school" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("valid contact email"),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => String(input).endsWith("/platform/schools") && init?.method === "POST",
      ),
    ).toBe(false);

    fireEvent.change(screen.getByLabelText("Contact email"), {
      target: { value: "  office@new-school.test " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create suspended school" }));

    expect(await screen.findByText("New School")).toBeTruthy();
    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      expect.stringContaining("created in suspended status"),
    );
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/platform/schools") && init?.method === "POST",
    );
    expect(createCall).toBeTruthy();
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      name: "New School",
      contactEmail: "office@new-school.test",
    });
  });

  it("keeps failed school writes visible and allows correcting or retrying them", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/platform/schools?")) {
        return jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } });
      }
      if (url.endsWith("/platform/schools") && init?.method === "POST") {
        return jsonResponse(409, {
          error: { code: "CONFLICT", message: "A school with this name already exists." },
        });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderPage(<SuperadminSchoolsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add school" }));
    fireEvent.change(screen.getByLabelText("School name"), { target: { value: "North School" } });
    fireEvent.click(screen.getByRole("button", { name: "Create suspended school" }));

    expect(await screen.findByText("A school with this name already exists.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create suspended school" })).toBeTruthy();
  });

  it("edits school metadata and performs only a documented lifecycle transition", async () => {
    let schoolStatus = "ACTIVE";
    let schoolName = "North School";
    let schoolEmail: string | null = "office@example.test";
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/platform/schools?")) {
        return jsonResponse(200, {
          data: [
            {
              id: "school-1",
              name: "North School",
              contactEmail: "office@example.test",
              contactPhone: null,
              status: schoolStatus,
              createdAt: "2026-10-20T00:00:00.000Z",
              updatedAt: "2026-10-20T00:00:00.000Z",
            },
          ],
          meta: { limit: 25, offset: 0, total: 1 },
        });
      }
      if (url.endsWith("/platform/schools/school-1") && !init?.method) {
        return jsonResponse(200, {
          data: {
            id: "school-1",
            name: schoolName,
            contactEmail: schoolEmail,
            contactPhone: null,
            status: schoolStatus,
            createdAt: "2026-10-20T00:00:00.000Z",
            updatedAt: "2026-10-20T00:00:00.000Z",
          },
        });
      }
      if (url.endsWith("/platform/schools/school-1") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as {
          name: string;
          contactEmail: string | null;
          contactPhone: string | null;
        };
        schoolName = body.name;
        schoolEmail = body.contactEmail;
        return jsonResponse(200, {
          data: {
            id: "school-1",
            name: schoolName,
            contactEmail: schoolEmail,
            contactPhone: body.contactPhone,
            status: schoolStatus,
            createdAt: "2026-10-20T00:00:00.000Z",
            updatedAt: "2026-10-25T00:00:00.000Z",
          },
        });
      }
      if (url.endsWith("/platform/schools/school-1/status") && init?.method === "PATCH") {
        schoolStatus = (JSON.parse(String(init.body)) as { status: string }).status;
        return jsonResponse(200, {
          data: {
            id: "school-1",
            name: "North School Updated",
            contactEmail: null,
            contactPhone: null,
            status: schoolStatus,
            createdAt: "2026-10-20T00:00:00.000Z",
            updatedAt: "2026-10-25T00:00:00.000Z",
          },
        });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderPage(<SuperadminSchoolsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Manage North School" }));
    expect(await within(screen.getByRole("dialog")).findByText("school-1")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/platform/schools/school-1") && init?.method === "GET",
      ),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("School name"), {
      target: { value: "North School Updated" },
    });
    fireEvent.change(screen.getByLabelText("Contact email"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save school details" }));
    expect(await screen.findByText("School contact details saved.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("New status"), {
      target: { value: "SUSPENDED" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review status change" }));
    expect(screen.getByText("Confirm changing this school from ACTIVE to SUSPENDED?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm SUSPENDED" }));
    expect(await screen.findByText("School status updated to SUSPENDED.")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/platform/schools/school-1/status") &&
          init?.method === "PATCH" &&
          init.body === JSON.stringify({ status: "SUSPENDED" }),
      ),
    ).toBe(true);
  });

  it("loads plans and a selected school's assignment history from backend endpoints", async () => {
    let assignmentEnded = false;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/platform/plans?limit=100&offset=0&active=true")) {
        return jsonResponse(200, {
          data: [
            {
              id: "plan-1",
              code: "BASIC",
              name: "Basic",
              description: null,
              entitlements: { seats: 50 },
              active: true,
              createdAt: "2026-10-20T00:00:00.000Z",
              updatedAt: "2026-10-20T00:00:00.000Z",
            },
          ],
          meta: { limit: 100, offset: 0, total: 1 },
        });
      }
      if (url.endsWith("/platform/plans?limit=25&offset=0")) {
        return jsonResponse(200, {
          data: [
            {
              id: "plan-1",
              code: "BASIC",
              name: "Basic",
              description: null,
              entitlements: { seats: 50 },
              active: true,
              createdAt: "2026-10-20T00:00:00.000Z",
              updatedAt: "2026-10-20T00:00:00.000Z",
            },
          ],
          meta: { limit: 25, offset: 0, total: 1 },
        });
      }
      if (url.endsWith("/platform/schools?limit=25&offset=0")) {
        return jsonResponse(200, {
          data: [
            {
              id: "school-1",
              name: "North School",
              contactEmail: null,
              contactPhone: null,
              status: "ACTIVE",
              createdAt: "2026-10-20T00:00:00.000Z",
              updatedAt: "2026-10-20T00:00:00.000Z",
            },
          ],
          meta: { limit: 25, offset: 0, total: 1 },
        });
      }
      if (url.endsWith("/platform/schools/school-1/subscriptions?limit=25&offset=0")) {
        return jsonResponse(200, {
          data: assignmentEnded
            ? [
                {
                  id: "subscription-1",
                  schoolId: "school-1",
                  schoolName: "North School",
                  planId: "plan-1",
                  planCode: "BASIC",
                  planName: "Basic",
                  entitlements: { seats: 50 },
                  assignedByUserId: "operator-1",
                  assignedAt: "2026-10-21T00:00:00.000Z",
                  endedAt: "2026-10-25T00:00:00.000Z",
                },
              ]
            : [
                {
                  id: "subscription-1",
                  schoolId: "school-1",
                  schoolName: "North School",
                  planId: "plan-1",
                  planCode: "BASIC",
                  planName: "Basic",
                  entitlements: { seats: 50 },
                  assignedByUserId: "operator-1",
                  assignedAt: "2026-10-21T00:00:00.000Z",
                  endedAt: null,
                },
              ],
          meta: { limit: 25, offset: 0, total: 1 },
        });
      }
      if (url.endsWith("/platform/schools/school-1/subscription") && init?.method === "PUT") {
        return jsonResponse(200, { data: {} });
      }
      if (url.endsWith("/platform/schools/school-1/subscription/end") && init?.method === "POST") {
        assignmentEnded = true;
        return noContentResponse();
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderPage(<PlatformPlansPage />);

    expect(await screen.findByText("Basic")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "School" }), {
      target: { value: "school-1" },
    });
    expect(await screen.findByText("Current assignment")).toBeTruthy();
    expect(
      within(screen.getByRole("table", { name: "School plan assignment history" })).getByText(
        "seats: 50",
      ),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith("/platform/schools/school-1/subscriptions?limit=25&offset=0"),
      ),
    ).toBe(true);

    fireEvent.change(screen.getByRole("combobox", { name: "Active plan" }), {
      target: { value: "plan-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign plan" }));
    expect(await screen.findByRole("dialog", { name: "Confirm plan assignment" })).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/platform/schools/school-1/subscription") &&
          init?.method === "PUT",
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    expect(
      await screen.findByText(
        "Metadata plan assignment saved. No billing or access change is implied.",
      ),
    ).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/platform/schools/school-1/subscription") &&
          init?.method === "PUT" &&
          init.body === JSON.stringify({ planId: "plan-1" }),
      ),
    ).toBe(true);

    fireEvent.click(await screen.findByRole("button", { name: "End assignment" }));
    expect(await screen.findByRole("dialog", { name: "End metadata assignment?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm end assignment" }));
    expect(
      await screen.findByText(
        "Metadata assignment ended. School access and billing were not changed.",
      ),
    ).toBeTruthy();
    expect(await screen.findByText("Ended")).toBeTruthy();
  });

  it("searches and filters plans, shows contract-backed details, and compares raw entitlement metadata", async () => {
    const planRecords = [
      {
        id: "plan-basic",
        code: "BASIC",
        name: "Basic",
        description: "Core metadata plan",
        entitlements: { seats: 50, library: true },
        active: true,
        createdAt: "2026-10-20T00:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
      {
        id: "plan-plus",
        code: "PLUS",
        name: "Plus",
        description: null,
        entitlements: { seats: 100, support: "priority" },
        active: true,
        createdAt: "2026-10-20T00:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
      {
        id: "plan-archived",
        code: "ARCHIVED",
        name: "Archived",
        description: null,
        entitlements: {},
        active: false,
        createdAt: "2026-10-20T00:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z",
      },
    ];
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/platform/plans?limit=100&offset=0&active=true")) {
        const data = planRecords.filter((plan) => plan.active);
        return jsonResponse(200, {
          data,
          meta: { limit: 100, offset: 0, total: data.length },
        });
      }
      if (url.includes("/platform/plans?")) {
        const data = url.includes("active=false")
          ? [planRecords[2]]
          : url.includes("search=Plus")
            ? [planRecords[1]]
            : planRecords;
        return jsonResponse(200, {
          data,
          meta: { limit: 25, offset: 0, total: data.length },
        });
      }
      if (url.includes("/platform/schools?")) {
        return jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderPage(<PlatformPlansPage />);

    expect(await screen.findByText("Basic")).toBeTruthy();
    expect(screen.getByText("Plus")).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Details" })[0]);
    expect(await screen.findByRole("dialog", { name: "Basic" })).toBeTruthy();
    expect(
      screen.getByText(
        "Price, currency, billing interval, payment status, and access enforcement are not represented by the available plan contract.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("50")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "Compare Basic" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Compare Plus" }));
    const comparison = screen.getByRole("table", {
      name: "Raw entitlement metadata comparison, not enforced product features",
    });
    expect(within(comparison).getByText("seats")).toBeTruthy();
    expect(within(comparison).getByText("library")).toBeTruthy();
    expect(within(comparison).getByText("support")).toBeTruthy();
    expect(within(comparison).getAllByText("Not declared").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search plans" }), {
      target: { value: "Plus" },
    });
    expect(await screen.findByText("Plus")).toBeTruthy();
    expect(screen.queryByText("Basic")).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/platform/plans?limit=25&offset=0&search=Plus"),
      ),
    ).toBe(true);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search plans" }), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Plan status"), { target: { value: "inactive" } });
    expect(await screen.findByText("Archived")).toBeTruthy();
    expect(screen.queryByText("Basic")).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/platform/plans?limit=25&offset=0&active=false"),
      ),
    ).toBe(true);
  });

  it("validates plan metadata and creates a plan using the supported endpoint", async () => {
    let created = false;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/platform/plans?limit=100&offset=0&active=true")) {
        const data = created
          ? [
              {
                id: "plan-new",
                code: "STANDARD",
                name: "Standard",
                description: null,
                entitlements: { seats: 50 },
                active: true,
                createdAt: "2026-10-25T00:00:00.000Z",
                updatedAt: "2026-10-25T00:00:00.000Z",
              },
            ]
          : [];
        return jsonResponse(200, {
          data,
          meta: { limit: 100, offset: 0, total: data.length },
        });
      }
      if (url.includes("/platform/plans?")) {
        return jsonResponse(200, {
          data: created
            ? [
                {
                  id: "plan-new",
                  code: "STANDARD",
                  name: "Standard",
                  description: null,
                  entitlements: { seats: 50 },
                  active: true,
                  createdAt: "2026-10-25T00:00:00.000Z",
                  updatedAt: "2026-10-25T00:00:00.000Z",
                },
              ]
            : [],
          meta: { limit: 25, offset: 0, total: created ? 1 : 0 },
        });
      }
      if (url.includes("/platform/schools?")) {
        return jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } });
      }
      if (url.endsWith("/platform/plans") && init?.method === "POST") {
        created = true;
        return jsonResponse(201, {
          data: {
            id: "plan-new",
            code: "STANDARD",
            name: "Standard",
            description: null,
            entitlements: { seats: 50 },
            active: true,
            createdAt: "2026-10-25T00:00:00.000Z",
            updatedAt: "2026-10-25T00:00:00.000Z",
          },
        });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderPage(<PlatformPlansPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add plan" }));
    fireEvent.change(screen.getByLabelText("Plan code"), { target: { value: "standard" } });
    fireEvent.change(screen.getByLabelText("Plan name"), { target: { value: "Standard" } });
    fireEvent.change(screen.getByLabelText("Entitlement metadata JSON"), {
      target: { value: '{"seats": []}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review plan changes" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Entitlement values must be strings"),
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => String(input).endsWith("/platform/plans") && init?.method === "POST",
      ),
    ).toBe(false);

    fireEvent.change(screen.getByLabelText("Entitlement metadata JSON"), {
      target: { value: '{"seats": 50}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review plan changes" }));
    expect(await screen.findByRole("dialog", { name: "Confirm plan creation" })).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => String(input).endsWith("/platform/plans") && init?.method === "POST",
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm creation" }));
    expect(await screen.findByText("Plan created.")).toBeTruthy();
    expect(await screen.findByText("STANDARD")).toBeTruthy();
    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input).endsWith("/platform/plans") && init?.method === "POST",
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      code: "STANDARD",
      name: "Standard",
      entitlements: { seats: 50 },
    });
  });

  it("filters platform audit events on the loaded page and shows privacy-conscious details", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [
          {
            id: "event-1",
            actorUserId: "operator-1",
            eventType: "PLATFORM_PLAN_UPDATED",
            outcome: "SUCCESS",
            requestId: "request-1",
            occurredAt: "2026-10-24T10:00:00.000Z",
            metadata: { changedFields: ["name"], sensitiveValue: "must-not-render" },
          },
          {
            id: "event-2",
            actorUserId: "operator-2",
            eventType: "PLATFORM_SCHOOL_UPDATED",
            outcome: "FAILURE",
            requestId: "request-2",
            occurredAt: "2026-10-25T10:00:00.000Z",
            metadata: { changedFields: ["status"] },
          },
        ],
        meta: { limit: 25, offset: 0, total: 2 },
      }),
    );

    renderPage(<PlatformAuditPage />);

    expect(await screen.findByRole("rowheader", { name: "PLATFORM_PLAN_UPDATED" })).toBeTruthy();
    expect(screen.getByText(/changedFields, sensitiveValue/)).toBeTruthy();
    expect(screen.queryByText("must-not-render")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/platform/audit-events?limit=25&offset=0",
      expect.any(Object),
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search this page" }), {
      target: { value: "operator-2" },
    });
    expect(screen.queryByRole("rowheader", { name: "PLATFORM_PLAN_UPDATED" })).toBeNull();
    expect(screen.getByRole("rowheader", { name: "PLATFORM_SCHOOL_UPDATED" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Event type"), {
      target: { value: "PLATFORM_SCHOOL_UPDATED" },
    });
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "FAILURE" } });

    fireEvent.change(screen.getByLabelText("Audit events from date"), {
      target: { value: "2026-10-26" },
    });
    expect(screen.getByText("No matching audit events")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);

    fireEvent.click(screen.getAllByRole("button", { name: "View details" })[0]);
    const details = await screen.findByRole("dialog", { name: "Audit event details" });
    expect(within(details).getByText("operator-1")).toBeTruthy();
    expect(within(details).getByText("request-1")).toBeTruthy();
    expect(within(details).getByText("changedFields, sensitiveValue")).toBeTruthy();
    expect(screen.queryByText("must-not-render")).toBeNull();
  });

  it("paginates audit events using the documented limit and offset parameters", async () => {
    const firstPage = Array.from({ length: 25 }, (_, index) => ({
      id: `event-${index + 1}`,
      actorUserId: null,
      eventType: `PLATFORM_EVENT_${index + 1}`,
      outcome: "SUCCESS",
      requestId: null,
      occurredAt: "2026-10-24T10:00:00.000Z",
      metadata: {},
    }));
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/platform/audit-events?limit=25&offset=0")) {
        return jsonResponse(200, {
          data: firstPage,
          meta: { limit: 25, offset: 0, total: 26 },
        });
      }
      if (url.endsWith("/platform/audit-events?limit=25&offset=25")) {
        return jsonResponse(200, {
          data: [
            {
              id: "event-26",
              actorUserId: null,
              eventType: "PLATFORM_EVENT_26",
              outcome: "SUCCESS",
              requestId: null,
              occurredAt: "2026-10-25T10:00:00.000Z",
              metadata: {},
            },
          ],
          meta: { limit: 25, offset: 25, total: 26 },
        });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderPage(<PlatformAuditPage />);

    expect(await screen.findByRole("rowheader", { name: "PLATFORM_EVENT_1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("rowheader", { name: "PLATFORM_EVENT_26" })).toBeTruthy();
    expect(screen.getByText("Events 26–26 of 26 · 1 on this page")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/platform/audit-events?limit=25&offset=25",
      expect.any(Object),
    );
  });

  it("shows the MFA and session state reported by the platform API", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: { enrolled: true, sessionVerified: true } }),
    );

    renderPage(<PlatformSecurityPage />);

    expect(await screen.findByText("Enrolled")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Current factor and session" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Security sections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Access boundary" }).getAttribute("href")).toBe(
      "#access-boundary",
    );
    expect(document.getElementById("security-status")?.className).toContain("scroll-mt-20");
    expect(document.getElementById("access-boundary")?.className).toContain("scroll-mt-20");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/platform/mfa/status", expect.any(Object));
  });

  it("reports missing MFA enrollment and recovers from a status error", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(503, { error: { code: "UNAVAILABLE", message: "Temporarily unavailable" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { enrolled: false, sessionVerified: false } }),
      );

    renderPage(<PlatformSecurityPage />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Not enrolled")).toBeTruthy();
    expect(screen.getByText("Verification required")).toBeTruthy();
  });

  it("explains unavailable platform configuration without issuing requests or offering fake controls", () => {
    renderPage(<PlatformSettingsPage />);

    expect(screen.getByRole("heading", { name: "Platform settings" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Platform settings sections" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Platform configuration" })).toBeTruthy();
    expect(document.getElementById("configuration")?.className).toContain("scroll-mt-20");
    expect(
      screen.getByText(/No approved platform settings fields or read\/update endpoints/),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "View platform security status" }).getAttribute("href"),
    ).toBe("/superadmin/security");
    expect(screen.getByText(/No secrets, tokens, credentials/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders clearly labeled page-session platform-user previews without calling an API", async () => {
    renderPage(<PlatformUsersPage />);

    expect(await screen.findByRole("heading", { name: "Platform user preview" })).toBeTruthy();
    expect(
      superadminNavigationItems.find((item) => item.href === "/superadmin/platform-users")?.label,
    ).toBe("Platform Users Preview");
    expect(await screen.findByText("Demo Platform Operator")).toBeTruthy();
    expect(screen.getByText("Demonstration workspace")).toBeTruthy();
    expect(screen.getAllByText("ACTIVE · demo")).toHaveLength(2);
    expect(
      screen.getByRole("table", { name: /demonstration platform-user entries/i }),
    ).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search preview entries" }), {
      target: { value: "reviewer@" },
    });
    expect(screen.getByText("Demo Support Reviewer")).toBeTruthy();
    expect(screen.queryByText("Demo Platform Operator")).toBeNull();

    fireEvent.change(screen.getByLabelText("Demo status"), { target: { value: "ACTIVE" } });
    expect(screen.getByText("Demo Support Reviewer")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Demo status"), { target: { value: "SUSPENDED" } });
    expect(screen.getByText("No matching entries")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search preview entries" }), {
      target: { value: "" },
    });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "View preview details for Demo Read-only Analyst",
      }),
    );
    expect(await screen.findByRole("heading", { name: "Demo Read-only Analyst" })).toBeTruthy();
    expect(screen.getByText(/No platform account or permissions are associated/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates a demo entry and confirms only an isolated page-session preview", async () => {
    renderPage(<PlatformUsersPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add demo user" }));
    fireEvent.click(screen.getByRole("button", { name: "Review preview entry" }));
    expect(await screen.findByText("Enter a display name (up to 200 characters).")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Display name/), {
      target: { value: "Preview Operator" },
    });
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: "preview@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review preview entry" }));

    expect(await screen.findByRole("dialog", { name: "Confirm preview entry" })).toBeTruthy();
    expect(screen.getByText(/will not create a platform account/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add page-session preview" }));

    expect(await screen.findByText("Preview Operator")).toBeTruthy();
    expect(
      screen.getByText(
        "Preview entry added for this page session only. No account was created and no invitation was sent.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("PENDING · demo")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks platform navigation destinations without an API as unfinished", () => {
    const item = (href: string) => superadminNavigationItems.find((entry) => entry.href === href);
    expect(item("/superadmin/school-administrators")?.description).toContain("Not implemented");
    expect(item("/superadmin/analytics")?.description).toContain("Not implemented");
    expect(item("/superadmin/settings")?.description).toContain("unavailable");
    expect(item("/superadmin/platform-users")?.description).toContain("unavailable");
  });

  it("offers retry after a school API error and renders the returned empty state", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable")).mockResolvedValueOnce(
      jsonResponse(200, {
        data: [],
        meta: { limit: 25, offset: 0, total: 0 },
      }),
    );

    renderPage(<SuperadminSchoolsPage />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No schools")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
