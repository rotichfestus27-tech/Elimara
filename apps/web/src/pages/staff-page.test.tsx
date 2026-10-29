import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { StaffPage } from "./staff-page";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    school: {
      id: "school-1",
      permissions: ["staff.profile.read", "staff.profile.manage", "staff.assignment.read"],
    },
  })),
}));

vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));

const fetchMock = vi.fn<typeof fetch>();
const staffMember = {
  id: "staff-1",
  staffNumber: "EMP-001",
  givenName: "David",
  middleName: null,
  familyName: "Kariuki",
  contactEmail: null,
  contactPhone: null,
  positionTitle: "Teacher",
  departmentId: null,
  department: null,
  userId: null,
  status: "ACTIVE",
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function renderStaffPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <StaffPage />
    </QueryClientProvider>,
  );
}

describe("StaffPage pagination", () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        permissions: ["staff.profile.read", "staff.profile.manage", "staff.assignment.read"],
      },
    });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const isStaff = url.includes("/staff?");
      const offset = new URL(url, window.location.origin).searchParams.get("offset");

      return jsonResponse(200, {
        data: isStaff ? [staffMember] : [],
        meta: {
          total: isStaff ? 30 : 0,
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

  it("announces which staff workspace view is selected", () => {
    renderStaffPage();

    const staffTab = screen.getByRole("button", {
      name: /^Staff & Teachers Directory/,
    });
    const departmentsTab = screen.getByRole("button", { name: /^Departments/ });

    expect(staffTab.getAttribute("aria-pressed")).toBe("true");
    expect(departmentsTab.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(departmentsTab);

    expect(staffTab.getAttribute("aria-pressed")).toBe("false");
    expect(departmentsTab.getAttribute("aria-pressed")).toBe("true");
  });

  it("associates each new staff profile label with its control", async () => {
    renderStaffPage();

    fireEvent.click(await screen.findByRole("button", { name: "New Staff Profile" }));
    const dialog = await screen.findByRole("dialog", { name: "New Staff Profile" });

    expect(within(dialog).getByRole("group", { name: "Staff name" })).toBeTruthy();
    expect(within(dialog).getByLabelText(/Staff Number \/ Employee ID/)).toBeTruthy();
    expect(within(dialog).getByLabelText(/Given name/)).toBeTruthy();
    expect(within(dialog).getByLabelText("Middle name")).toBeTruthy();
    expect(within(dialog).getByLabelText(/Family name/)).toBeTruthy();
    expect(within(dialog).getByLabelText(/Position Title/)).toBeTruthy();
    expect(within(dialog).getByLabelText("Department")).toBeTruthy();
    expect(within(dialog).getByLabelText("Phone number")).toBeTruthy();
    expect(within(dialog).getByLabelText("Contact email")).toBeTruthy();
  });

  it("announces a failed staff profile submission and preserves entered values", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/staff") && init?.method === "POST") {
        return jsonResponse(409, {
          error: { message: "A staff profile with this staff number already exists." },
        });
      }

      return jsonResponse(200, {
        data: [],
        meta: { total: 0, limit: 25, offset: 0 },
      });
    });

    renderStaffPage();
    fireEvent.click(await screen.findByRole("button", { name: "New Staff Profile" }));
    const dialog = await screen.findByRole("dialog", { name: "New Staff Profile" });
    const staffNumber = within(dialog).getByLabelText(/Staff Number \/ Employee ID/);
    const givenName = within(dialog).getByLabelText(/Given name/);
    const familyName = within(dialog).getByLabelText(/Family name/);

    fireEvent.change(staffNumber, { target: { value: "EMP-001" } });
    fireEvent.change(givenName, { target: { value: "David" } });
    fireEvent.change(familyName, { target: { value: "Kariuki" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Profile" }));

    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "A staff profile with this staff number already exists.",
    );
    expect(staffNumber).toHaveProperty("value", "EMP-001");
    expect(givenName).toHaveProperty("value", "David");
    expect(familyName).toHaveProperty("value", "Kariuki");
  });

  it("loads additional staff pages and resets to the first page after search", async () => {
    renderStaffPage();
    expect(await screen.findByText("Showing 1–1 of 30 staff profiles.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Showing 26–26 of 30 staff profiles.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/staff?limit=25&offset=25"),
      expect.any(Object),
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search by staff name or staff ID" }), {
      target: { value: "Kariuki" },
    });
    expect(await screen.findByText("Showing 1–1 of 30 staff profiles.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/staff?limit=25&offset=0&q=Kariuki"),
      expect.any(Object),
    );
  });

  it("uses returned staff pagination metadata for next-page requests", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/staff")) {
        return jsonResponse(200, {
          data: [staffMember],
          meta: {
            total: 20,
            limit: 10,
            offset: Number(url.searchParams.get("offset") ?? 0),
          },
        });
      }

      return jsonResponse(200, { data: [], meta: { total: 0, limit: 25, offset: 0 } });
    });

    renderStaffPage();
    expect(await screen.findByText("Showing 1–1 of 20 staff profiles.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Showing 11–11 of 20 staff profiles.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/staff?limit=10&offset=10"),
      expect.any(Object),
    );
  });

  it("uses returned department pagination metadata for next-page requests", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/departments")) {
        return jsonResponse(200, {
          data: [
            {
              id: "department-1",
              name: "Academics",
              status: "ACTIVE",
              createdAt: "2026-09-01T10:00:00.000Z",
              updatedAt: "2026-09-01T10:00:00.000Z",
            },
          ],
          meta: {
            total: 20,
            limit: 10,
            offset: Number(url.searchParams.get("offset") ?? 0),
          },
        });
      }

      return jsonResponse(200, {
        data: [staffMember],
        meta: { total: 1, limit: 25, offset: 0 },
      });
    });

    renderStaffPage();
    fireEvent.click(screen.getByRole("button", { name: /^Departments/ }));
    expect(await screen.findByText("Showing 1–1 of 20 departments.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Showing 11–11 of 20 departments.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/departments?limit=10&offset=10"),
      expect.any(Object),
    );
  });

  it("retries a failed staff-list request and displays recovered records", async () => {
    let requestCount = 0;
    fetchMock.mockImplementation((input) => {
      if (!String(input).includes("/staff?")) {
        return Promise.resolve(
          jsonResponse(200, { data: [], meta: { total: 0, limit: 25, offset: 0 } }),
        );
      }

      requestCount += 1;
      if (requestCount === 1) {
        return Promise.resolve(
          jsonResponse(503, {
            error: { message: "Staff records are temporarily unavailable." },
          }),
        );
      }

      return Promise.resolve(
        jsonResponse(200, {
          data: [staffMember],
          meta: { total: 1, limit: 25, offset: 0 },
        }),
      );
    });

    renderStaffPage();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Staff records are temporarily unavailable.",
    );
    const staffTab = screen.getByRole("button", { name: /^Staff & Teachers Directory/ });
    expect(within(staffTab).getByText("Unavailable")).toBeTruthy();
    expect(within(staffTab).queryByText("0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading staff" }));

    expect(
      await screen.findByRole("button", { name: "View details for David Kariuki" }),
    ).toBeTruthy();
    expect(requestCount).toBe(2);
  });

  it("does not display zero departments when the department request fails", async () => {
    fetchMock.mockImplementation((input) => {
      if (String(input).includes("/departments?")) {
        return Promise.resolve(
          jsonResponse(503, {
            error: { message: "Department records are temporarily unavailable." },
          }),
        );
      }

      return Promise.resolve(
        jsonResponse(200, {
          data: [staffMember],
          meta: { total: 1, limit: 25, offset: 0 },
        }),
      );
    });

    renderStaffPage();
    const departmentsTab = screen.getByRole("button", { name: /^Departments/ });
    fireEvent.click(departmentsTab);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Department records are temporarily unavailable.",
    );
    expect(within(departmentsTab).getByText("Unavailable")).toBeTruthy();
    expect(within(departmentsTab).queryByText("0")).toBeNull();
  });

  it("presents staff profile details as a responsive definition list and wraps long email values", async () => {
    const longEmail = "avery.long.staff.contact.address@example-school-domain.test";
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const isStaff = url.includes("/staff?");
      return jsonResponse(200, {
        data: isStaff ? [{ ...staffMember, contactEmail: longEmail }] : [],
        meta: { total: isStaff ? 1 : 0, limit: 25, offset: 0 },
      });
    });

    renderStaffPage();
    fireEvent.click(await screen.findByRole("button", { name: "View details for David Kariuki" }));

    const dialog = await screen.findByRole("dialog", { name: "David Kariuki" });
    const email = within(dialog).getByText(longEmail);
    const emailDefinition = email.closest("dd");
    const details = email.closest("dl");

    expect(emailDefinition?.className).toContain("break-all");
    expect(details?.className).toContain("sm:grid-cols-2");
    expect(within(dialog).getByText("Email").tagName).toBe("DT");
  });

  it("retries a failed assignment history request and shows the recovered empty state", async () => {
    let assignmentRequests = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/staff")) {
        return jsonResponse(200, {
          data: [staffMember],
          meta: { total: 1, limit: 25, offset: 0 },
        });
      }

      if (url.pathname.endsWith("/departments")) {
        return jsonResponse(200, {
          data: [],
          meta: { total: 0, limit: 25, offset: 0 },
        });
      }

      if (url.pathname.endsWith("/assignments")) {
        assignmentRequests += 1;
        if (assignmentRequests === 1) {
          return jsonResponse(503, {
            error: { message: "Assignment history is temporarily unavailable." },
          });
        }
        return jsonResponse(200, { data: [] });
      }

      throw new Error(`Unexpected request: ${url.pathname}`);
    });

    renderStaffPage();
    fireEvent.click(await screen.findByRole("button", { name: "View details for David Kariuki" }));

    const dialog = await screen.findByRole("dialog", { name: "David Kariuki" });
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Assignment history is temporarily unavailable.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Retry loading assignments" }));

    expect(
      await within(dialog).findByText("No teaching assignments recorded for this staff member."),
    ).toBeTruthy();
    expect(assignmentRequests).toBe(2);
  });

  it("retries a failed employment history request and shows the recovered empty state", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        permissions: [
          "staff.profile.read",
          "staff.profile.manage",
          "staff.employment.read",
        ],
      },
    });
    let employmentRequests = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/staff")) {
        return jsonResponse(200, {
          data: [staffMember],
          meta: { total: 1, limit: 25, offset: 0 },
        });
      }

      if (url.pathname.endsWith("/departments")) {
        return jsonResponse(200, {
          data: [],
          meta: { total: 0, limit: 25, offset: 0 },
        });
      }

      if (url.pathname.endsWith("/employments")) {
        employmentRequests += 1;
        if (employmentRequests === 1) {
          return jsonResponse(503, {
            error: { message: "Employment history is temporarily unavailable." },
          });
        }
        return jsonResponse(200, { data: [] });
      }

      throw new Error(`Unexpected request: ${url.pathname}`);
    });

    renderStaffPage();
    fireEvent.click(await screen.findByRole("button", { name: "View details for David Kariuki" }));

    const dialog = await screen.findByRole("dialog", { name: "David Kariuki" });
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Employment history is temporarily unavailable.",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Retry loading employment history" }),
    );

    expect(await within(dialog).findByText("No formal employment stints recorded.")).toBeTruthy();
    expect(employmentRequests).toBe(2);
  });
});
