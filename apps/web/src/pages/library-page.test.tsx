import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { LibraryPage } from "./library-page";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    school: {
      id: "school-1",
      name: "Authorized School",
      permissions: [
        "library.catalog.read",
        "library.catalog.manage",
        "library.loans.read",
        "library.reports.read",
      ],
    },
  })),
}));

vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));

const fetchMock = vi.fn<typeof fetch>();

function renderLibraryPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LibraryPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fetchMock.mockReset();
  useAuthMock.mockReturnValue({
    school: {
      id: "school-1",
      name: "Authorized School",
      permissions: [
        "library.catalog.read",
        "library.catalog.manage",
        "library.loans.read",
        "library.reports.read",
      ],
    },
  });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((input) => {
    const url = String(input);
    if (url.includes("/library/categories?")) {
      return Promise.resolve(
        jsonResponse(200, {
          data: [{ id: "category-1", name: "Reference", archivedAt: null }],
          meta: { limit: 100, offset: 0, total: 1 },
        }),
      );
    }
    if (url.includes("/library/catalog/items?")) {
      return Promise.resolve(
        jsonResponse(200, {
          data: [
            {
              id: "item-1",
              title: "Reference book",
              author: "School Library",
              isbn: null,
              categoryId: null,
              archivedAt: null,
            },
          ],
          meta: { limit: 25, offset: 0, total: 42 },
        }),
      );
    }
    if (url.endsWith("/library/catalog/items/item-1")) {
      return Promise.resolve(
        jsonResponse(200, {
          data: {
            id: "item-1",
            title: "Reference book",
            author: "School Library",
            isbn: null,
            categoryId: "category-1",
            archivedAt: null,
          },
        }),
      );
    }
    if (url.includes("/library/catalog/items/item-1/copies?")) {
      return Promise.resolve(
        jsonResponse(200, {
          data: [
            {
              id: "copy-uuid-active",
              itemId: "item-1",
              archivedAt: null,
              createdAt: "2026-10-20T10:00:00.000Z",
              updatedAt: "2026-10-20T10:00:00.000Z",
            },
            {
              id: "copy-uuid-archived",
              itemId: "item-1",
              archivedAt: "2026-10-22T10:00:00.000Z",
              createdAt: "2026-10-20T10:00:00.000Z",
              updatedAt: "2026-10-22T10:00:00.000Z",
            },
          ],
          meta: { limit: 25, offset: 0, total: 2 },
        }),
      );
    }
    if (url.includes("/library/loans?")) {
      if (url.includes("status=RETURNED")) {
        return Promise.resolve(
          jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
        );
      }
      return Promise.resolve(
        jsonResponse(200, {
          data: [
            {
              id: "loan-1",
              itemId: "item-1",
              copyId: "copy-1",
              studentId: "student-1",
              staffId: null,
              checkedOutAt: "2026-10-20T10:00:00.000Z",
              dueOn: "2026-10-30",
              returnedAt: null,
              renewalCount: 0,
            },
          ],
          meta: { limit: 25, offset: 0, total: 7 },
        }),
      );
    }
    if (url.includes("/library/reports/loans?")) {
      return Promise.resolve(
        jsonResponse(200, {
          data: { checkedOut: 4, active: 2, returned: 2, overdue: 1 },
        }),
      );
    }
    return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
  });
});

describe("LibraryPage", () => {
  it("announces the loan report loading state to assistive technology", async () => {
    let resolveReport!: (response: Response) => void;
    const reportResponse = new Promise<Response>((resolve) => {
      resolveReport = resolve;
    });
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.reports.read"],
      },
    });
    fetchMock.mockImplementation((input) =>
      String(input).includes("/library/reports/loans?")
        ? reportResponse
        : Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } })),
    );

    renderLibraryPage();

    expect((await screen.findByRole("status")).textContent).toContain(
      "Loading Library loan summary...",
    );
    resolveReport(
      jsonResponse(200, {
        data: { checkedOut: 0, active: 0, returned: 0, overdue: 0 },
      }),
    );
    expect(await screen.findByText("No loans in this report range")).toBeTruthy();
  });

  it("shows authoritative totals and the bounded circulation report", async () => {
    renderLibraryPage();

    const activeLoans = await screen.findByRole("table", { name: "Active school library loans" });
    expect(screen.getByText("student-1")).toBeTruthy();
    expect(await screen.findByText("30 Oct 2026")).toBeTruthy();
    expect(await within(activeLoans).findByText("Reference book")).toBeTruthy();
    expect(within(activeLoans).getByText("Catalog item ID: item-1")).toBeTruthy();
    const summary = screen.getByRole("region", { name: "Library summary" });
    expect(within(summary).getByText("Catalog records")).toBeTruthy();
    expect(within(summary).getByText("42")).toBeTruthy();
    expect(within(summary).getByText("Active loans")).toBeTruthy();
    expect(within(summary).getByText("7")).toBeTruthy();
    expect(within(summary).getByText("Checkouts")).toBeTruthy();
    expect(within(summary).getByText("Active loans in range")).toBeTruthy();
    expect(within(summary).getByText("Overdue loans")).toBeTruthy();
    expect(within(summary).getByText("Returned loans")).toBeTruthy();
    expect(within(summary).getByText("1")).toBeTruthy();
    expect(within(summary).queryByText(/physical copies|available copies/i)).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/v1\/schools\/school-1\/library\/catalog\/items\?.*includeArchived=true/,
      ),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/schools\/school-1\/library\/loans\?.*status=ACTIVE/),
      expect.any(Object),
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => String(input).includes("/library/catalog/items?"))
          .length,
      ).toBe(2);
      expect(
        fetchMock.mock.calls.filter(
          ([input]) =>
            String(input).includes("/library/loans?") && String(input).includes("status=ACTIVE"),
        ).length,
      ).toBe(2);
      expect(
        fetchMock.mock.calls.filter(
          ([input]) =>
            String(input).includes("/library/loans?") && String(input).includes("status=RETURNED"),
        ).length,
      ).toBe(2);
      expect(
        fetchMock.mock.calls.filter(([input]) => String(input).includes("/library/reports/loans?"))
          .length,
      ).toBe(2);
    });
  });

  it("shows loading, empty, and retryable API error states", async () => {
    let reportCalls = 0;
    fetchMock.mockImplementation((input) => {
      if (String(input).includes("/library/categories?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [],
            meta: { limit: 100, offset: 0, total: 0 },
          }),
        );
      }
      if (String(input).includes("/library/catalog/items?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [],
            meta: { limit: 25, offset: 0, total: 0 },
          }),
        );
      }
      if (String(input).includes("/library/loans?")) {
        return new Promise<Response>(() => {});
      }
      if (String(input).includes("/library/reports/loans?")) {
        reportCalls += 1;
        return reportCalls === 1
          ? Promise.resolve(jsonResponse(503, { error: { message: "Unavailable" } }))
          : Promise.resolve(
              jsonResponse(200, {
                data: { checkedOut: 0, active: 0, returned: 0, overdue: 0 },
              }),
            );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });

    renderLibraryPage();

    expect(await screen.findByText("Catalog is empty")).toBeTruthy();
    expect(await screen.findByText("The circulation summary could not be loaded.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findAllByText("Current state for loans checked out in the selected date range"),
    ).not.toHaveLength(0);
  });

  it("does not present cached empty report data as current after a refresh fails", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    let reportCalls = 0;
    fetchMock.mockImplementation((input, init) => {
      if (String(input).includes("/library/reports/loans?")) {
        reportCalls += 1;
        return Promise.resolve(
          reportCalls === 1
            ? jsonResponse(200, {
                data: { checkedOut: 0, active: 0, returned: 0, overdue: 0 },
              })
            : jsonResponse(503, { error: { message: "Unavailable" } }),
        );
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });

    renderLibraryPage();

    expect(await screen.findByText("No loans in this report range")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("The circulation summary could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("No loans in this report range")).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Library summary" })).getAllByText("Unavailable"),
    ).toHaveLength(4);
  });

  it("does not request library data without server-returned library permissions", () => {
    useAuthMock.mockReturnValue({
      school: { id: "school-1", name: "Authorized School", permissions: [] },
    });

    renderLibraryPage();

    expect(screen.getByText("Library access unavailable")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches titles and filters by the supported category field", async () => {
    renderLibraryPage();

    await screen.findAllByText("Reference book");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search title" }), {
      target: { value: "River" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), {
      target: { value: "category-1" },
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/library\/catalog\/items\?.*search=River.*categoryId=category-1/),
        expect.any(Object),
      );
    });
  });

  it("loads book details from the item detail endpoint", async () => {
    renderLibraryPage();
    fireEvent.click(await screen.findByRole("button", { name: "View Reference book details" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Book details")).toBeTruthy();
    expect(await within(dialog).findByText("Reference book")).toBeTruthy();
    expect(within(dialog).getByText("School Library")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/schools\/school-1\/library\/catalog\/items\/item-1$/),
      expect.any(Object),
    );
  });

  it("keeps catalog controls read-only without catalog management permission", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.catalog.read"],
      },
    });
    renderLibraryPage();

    await screen.findByText("Reference book");
    expect(screen.queryByRole("button", { name: "Register book" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Reference book" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Issue book" })).toBeNull();
  });

  it("shows catalog API authorization denial instead of a retryable service failure", async () => {
    fetchMock.mockImplementation((input) => {
      if (String(input).includes("/library/catalog/items?")) {
        return Promise.resolve(
          jsonResponse(403, { error: { code: "FORBIDDEN", message: "Denied" } }),
        );
      }
      if (String(input).includes("/library/categories?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [],
            meta: { limit: 100, offset: 0, total: 0 },
          }),
        );
      }
      if (String(input).includes("/library/loans?")) {
        return Promise.resolve(
          jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
        );
      }
      if (String(input).includes("/library/reports/loans?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: { checkedOut: 0, active: 0, returned: 0, overdue: 0 },
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });

    renderLibraryPage();

    expect(await screen.findByText("Catalog access denied")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByText("Catalog is empty")).toBeNull();
  });

  it("lists backend copy identifiers and archive state without inventing availability", async () => {
    renderLibraryPage();
    fireEvent.click(await screen.findByRole("button", { name: "View copies for Reference book" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("copy-uuid-active")).toBeTruthy();
    expect(within(dialog).getByText("copy-uuid-archived")).toBeTruthy();
    expect(within(dialog).getByText("Active record")).toBeTruthy();
    expect(within(dialog).getByText("Archived")).toBeTruthy();
    expect(within(dialog).queryByText("Available")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/api\/v1\/schools\/school-1\/library\/catalog\/items\/item-1\/copies\?/,
      ),
      expect.any(Object),
    );
  });

  it("registers a physical copy with the bodyless endpoint and refreshes inventory", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input, init) => {
      if (
        String(input).endsWith("/library/catalog/items/item-1/copies") &&
        (init as RequestInit | undefined)?.method === "POST"
      ) {
        return Promise.resolve(
          jsonResponse(201, {
            data: {
              id: "copy-uuid-new",
              itemId: "item-1",
              archivedAt: null,
              createdAt: "2026-10-25T10:00:00.000Z",
              updatedAt: "2026-10-25T10:00:00.000Z",
            },
          }),
        );
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();
    fireEvent.click(await screen.findByRole("button", { name: "View copies for Reference book" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("copy-uuid-active");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add physical copy" }));

    expect(await within(dialog).findByText("Physical copy registered.")).toBeTruthy();
    const postCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/library/catalog/items/item-1/copies") &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    if (!postCall) throw new Error("Copy registration request was not sent.");
    expect((postCall[1] as RequestInit).body).toBeUndefined();
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            String(input).includes("/library/catalog/items/item-1/copies?") &&
            (init as RequestInit | undefined)?.method !== "POST",
        ).length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows a permission-denied state when the copy inventory API returns 403", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input) => {
      if (String(input).includes("/library/catalog/items/item-1/copies?")) {
        return Promise.resolve(
          jsonResponse(403, { error: { code: "FORBIDDEN", message: "Denied" } }),
        );
      }
      return Promise.resolve(
        defaultFetch?.(input) ?? jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();
    fireEvent.click(await screen.findByRole("button", { name: "View copies for Reference book" }));

    expect(await screen.findByText("Copy inventory access unavailable")).toBeTruthy();
    expect(
      screen.getByText("The server denied access to this title's physical copy inventory."),
    ).toBeTruthy();
  });

  it("applies a supported date range to the Library loan report", async () => {
    renderLibraryPage();
    await screen.findByText("Checkouts");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply date range" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/library\/reports\/loans\?from=2026-10-01&to=2026-10-15/),
        expect.any(Object),
      );
    });
    expect(screen.getByText("2026-10-01 through 2026-10-15")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /export|download/i })).toBeNull();
  });

  it("rejects report ranges longer than the backend limit without requesting them", async () => {
    renderLibraryPage();
    await screen.findByText("Checkouts");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2025-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-01-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply date range" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "The report range cannot exceed 366 calendar days.",
    );
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes("/library/reports/loans?"))
        .length,
    ).toBe(1);
  });

  it("shows server permission denial for the Library report", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.reports.read"],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      if (String(input).includes("/library/reports/loans?")) {
        return Promise.resolve(
          jsonResponse(403, { error: { code: "FORBIDDEN", message: "Denied" } }),
        );
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();

    expect(await screen.findByText("Loan report access unavailable")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows returned loan history from the backend RETURNED status filter", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    const returnedLoan = {
      id: "c0a80100-0000-4000-8000-000000000021",
      itemId: "c0a80100-0000-4000-8000-000000000022",
      copyId: "c0a80100-0000-4000-8000-000000000023",
      studentId: "c0a80100-0000-4000-8000-000000000024",
      staffId: null,
      checkedOutAt: "2026-10-20T10:00:00.000Z",
      dueOn: "2026-10-30",
      returnedAt: "2026-10-25T13:30:00.000Z",
      renewalCount: 0,
    };
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.loans.read"],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/library/loans?") && url.includes("status=RETURNED")) {
        return Promise.resolve(
          jsonResponse(200, { data: [returnedLoan], meta: { limit: 25, offset: 0, total: 1 } }),
        );
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();

    expect(await screen.findByText(returnedLoan.id)).toBeTruthy();
    expect(screen.getByText(/25\/10\/2026/)).toBeTruthy();
    const returnedLoans = screen.getByRole("table", { name: "Returned school library loans" });
    expect(within(returnedLoans).getByText("Returned")).toBeTruthy();
    expect(within(returnedLoans).getByText("Catalog details unavailable")).toBeTruthy();
    expect(within(returnedLoans).getByText(`Catalog item ID: ${returnedLoan.itemId}`)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/library\/loans\?.*status=RETURNED/),
      expect.any(Object),
    );
  });

  it("does not mistake an unavailable active-loan response for empty circulation history", async () => {
    let activeCalls = 0;
    let resolveInitialActive!: (response: Response) => void;
    const initialActiveResponse = new Promise<Response>((resolve) => {
      resolveInitialActive = resolve;
    });
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/library/loans?") && url.includes("status=ACTIVE")) {
        activeCalls += 1;
        return activeCalls === 1
          ? initialActiveResponse
          : Promise.resolve(
              jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
            );
      }
      if (url.includes("/library/loans?") && url.includes("status=RETURNED")) {
        return Promise.resolve(
          jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.loans.read"],
      },
    });

    renderLibraryPage();

    expect(await screen.findByText("Loading active loans...")).toBeTruthy();
    resolveInitialActive(
      jsonResponse(503, { error: { code: "UNAVAILABLE", message: "Unavailable" } }),
    );
    expect(
      await screen.findByText("This information could not be loaded. Please try again."),
    ).toBeTruthy();
    expect(screen.queryByText("No active loans")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findAllByText("No active loans")).not.toHaveLength(0);
    expect(activeCalls).toBe(2);
  });

  it("keeps unavailable returned history distinct from an empty history and allows retry", async () => {
    let returnedCalls = 0;
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/library/loans?") && url.includes("status=ACTIVE")) {
        return Promise.resolve(
          jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
        );
      }
      if (url.includes("/library/loans?") && url.includes("status=RETURNED")) {
        returnedCalls += 1;
        return Promise.resolve(
          returnedCalls === 1
            ? jsonResponse(503, { error: { code: "UNAVAILABLE", message: "Unavailable" } })
            : jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.loans.read"],
      },
    });

    renderLibraryPage();

    expect(await screen.findAllByText("No active loans")).not.toHaveLength(0);
    expect(
      await screen.findByText("This information could not be loaded. Please try again."),
    ).toBeTruthy();
    expect(screen.queryByText("No returned loans")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("No returned loans")).toBeTruthy();
    expect(returnedCalls).toBe(2);
  });

  it("shows server authorization denials instead of empty loan lists", async () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.loans.read"],
      },
    });
    fetchMock.mockImplementation((input) => {
      if (String(input).includes("/library/loans?")) {
        return Promise.resolve(
          jsonResponse(403, { error: { code: "FORBIDDEN", message: "Denied" } }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });

    renderLibraryPage();

    expect(await screen.findByText("Loan history access unavailable")).toBeTruthy();
    expect(await screen.findByText("Returned history access unavailable")).toBeTruthy();
    expect(screen.queryByText("No active loans")).toBeNull();
    expect(screen.queryByText("No returned loans")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("labels active loan status using the documented UTC due-date rule", async () => {
    const overdueLoan = {
      id: "c0a80100-0000-4000-8000-000000000031",
      itemId: "c0a80100-0000-4000-8000-000000000032",
      copyId: "c0a80100-0000-4000-8000-000000000033",
      studentId: "c0a80100-0000-4000-8000-000000000034",
      staffId: null,
      checkedOutAt: "2020-01-01T10:00:00.000Z",
      dueOn: "2000-01-01",
      returnedAt: null,
      renewalCount: 0,
    };
    const activeLoan = {
      ...overdueLoan,
      id: "c0a80100-0000-4000-8000-000000000035",
      dueOn: "2999-12-31",
    };
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.loans.read"],
      },
    });
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/library/loans?") && url.includes("status=ACTIVE")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [overdueLoan, activeLoan],
            meta: { limit: 25, offset: 0, total: 2 },
          }),
        );
      }
      if (url.includes("/library/loans?") && url.includes("status=RETURNED")) {
        return Promise.resolve(
          jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
        );
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });

    renderLibraryPage();

    const activeLoans = await screen.findByRole("table", { name: "Active school library loans" });
    expect(within(activeLoans).getByText("Overdue")).toBeTruthy();
    expect(within(activeLoans).getByText("Active")).toBeTruthy();
  });

  it("filters active loans using the supported item and borrower query parameters", async () => {
    renderLibraryPage();
    await screen.findByText("student-1");
    fireEvent.change(screen.getByLabelText("Borrower type"), { target: { value: "staff" } });
    fireEvent.change(screen.getByLabelText("Borrower profile ID"), {
      target: { value: "a0b8b1c0-0000-4000-8000-000000000001" },
    });
    fireEvent.change(screen.getByLabelText("Catalog item ID"), {
      target: { value: "a0b8b1c0-0000-4000-8000-000000000002" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/library\/loans\?.*status=ACTIVE.*itemId=a0b8b1c0-0000-4000-8000-000000000002.*staffId=a0b8b1c0-0000-4000-8000-000000000001/,
        ),
        expect.any(Object),
      );
    });
  });

  it("issues a book by backend UUIDs and displays only the server-confirmed loan", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    let resolveCheckout!: (response: Response) => void;
    const checkoutResponse = new Promise<Response>((resolve) => {
      resolveCheckout = resolve;
    });
    const itemId = "a0b8b1c0-0000-4000-8000-000000000003";
    const copyId = "a0b8b1c0-0000-4000-8000-000000000004";
    const studentId = "a0b8b1c0-0000-4000-8000-000000000005";
    const issuedLoanId = "a0b8b1c0-0000-4000-8000-000000000006";
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: [
          "library.catalog.read",
          "library.loans.read",
          "library.loans.manage",
          "library.reports.read",
        ],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/library/catalog/items?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [{ id: itemId, title: "Verified title", archivedAt: null }],
            meta: { limit: 100, offset: 0, total: 1 },
          }),
        );
      }
      if (url.includes(`/library/catalog/items/${itemId}/copies?`)) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [
              { id: copyId, itemId, archivedAt: null },
              {
                id: "a0b8b1c0-0000-4000-8000-000000000007",
                itemId,
                archivedAt: "2026-10-20T10:00:00.000Z",
              },
            ],
            meta: { limit: 100, offset: 0, total: 2 },
          }),
        );
      }
      if (url.endsWith("/library/loans") && (init as RequestInit | undefined)?.method === "POST") {
        return checkoutResponse;
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();

    fireEvent.click(await screen.findByRole("button", { name: "Issue book" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Borrower profile UUID"), {
      target: { value: studentId },
    });
    fireEvent.change(await within(dialog).findByLabelText("Book title"), {
      target: { value: itemId },
    });
    fireEvent.change(await within(dialog).findByLabelText("Active copy record"), {
      target: { value: copyId },
    });
    expect(within(dialog).queryByLabelText("Due date")).toBeNull();
    const checkoutForm = dialog.querySelector("form");
    if (!checkoutForm) throw new Error("Checkout form was not rendered.");
    fireEvent.submit(checkoutForm);
    fireEvent.submit(checkoutForm);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            String(input).endsWith("/library/loans") &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toHaveLength(1);
    });
    resolveCheckout(
      jsonResponse(201, {
        data: {
          id: issuedLoanId,
          itemId,
          copyId,
          studentId,
          staffId: null,
          checkedOutAt: "2026-10-25T10:00:00.000Z",
          dueOn: "2026-11-08",
          returnedAt: null,
          renewalCount: 0,
        },
      }),
    );

    expect(await within(dialog).findByText(issuedLoanId)).toBeTruthy();
    expect(within(dialog).getByText("8 Nov 2026")).toBeTruthy();
    const checkoutCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/library/loans") &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    if (!checkoutCall) throw new Error("Checkout request was not sent.");
    expect(JSON.parse(String((checkoutCall[1] as RequestInit).body))).toEqual({
      copyId,
      studentId,
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            String(input).includes("/library/loans?") &&
            (init as RequestInit | undefined)?.method !== "POST",
        ).length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        fetchMock.mock.calls.filter(([input]) => String(input).includes("/library/reports/loans?"))
          .length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).includes(`/library/catalog/items/${itemId}/copies?`),
        ).length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  it("blocks checkout when a selected copy lookup fails after cached data was loaded", async () => {
    let copyRequests = 0;
    let checkoutRequests = 0;
    const itemId = "a0b8b1c0-0000-4000-8000-000000000021";
    const copyId = "a0b8b1c0-0000-4000-8000-000000000022";
    const studentId = "a0b8b1c0-0000-4000-8000-000000000023";
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.catalog.read", "library.loans.manage"],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (
        url.pathname.endsWith("/library/catalog/items") &&
        url.searchParams.get("limit") === "100"
      ) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [{ id: itemId, title: "Verified title", archivedAt: null }],
            meta: { limit: 100, offset: 0, total: 1 },
          }),
        );
      }
      if (url.pathname.endsWith(`/library/catalog/items/${itemId}/copies`)) {
        copyRequests += 1;
        return Promise.resolve(
          copyRequests === 1
            ? jsonResponse(200, {
                data: [{ id: copyId, itemId, archivedAt: null }],
                meta: { limit: 100, offset: 0, total: 1 },
              })
            : jsonResponse(503, { error: { message: "Copy service unavailable." } }),
        );
      }
      if (url.pathname.endsWith("/library/loans") && init?.method === "POST") {
        checkoutRequests += 1;
        return Promise.resolve(jsonResponse(201, { data: {} }));
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    const { queryClient } = renderLibraryPage();

    fireEvent.click(await screen.findByRole("button", { name: "Issue book" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Borrower profile UUID"), {
      target: { value: studentId },
    });
    fireEvent.change(await within(dialog).findByLabelText("Book title"), {
      target: { value: itemId },
    });
    fireEvent.change(await within(dialog).findByLabelText("Active copy record"), {
      target: { value: copyId },
    });
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["school-data", "school-1", `/library/catalog/items/${itemId}/copies`],
      });
    });

    expect(await within(dialog).findByText("Physical copies could not be loaded.")).toBeTruthy();
    const issueButton = within(dialog).getByRole<HTMLButtonElement>("button", {
      name: "Issue book",
    });
    expect(issueButton.disabled).toBe(true);
    const checkoutForm = dialog.querySelector("form");
    if (!checkoutForm) throw new Error("Checkout form was not rendered.");
    fireEvent.submit(checkoutForm);
    expect(checkoutRequests).toBe(0);
  });

  it("surfaces the server rejection when a selected copy is unavailable", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    const itemId = "a0b8b1c0-0000-4000-8000-000000000008";
    const copyId = "a0b8b1c0-0000-4000-8000-000000000009";
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.catalog.read", "library.loans.manage"],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/library/catalog/items?")) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [{ id: itemId, title: "Selected title", archivedAt: null }],
            meta: { limit: 100, offset: 0, total: 1 },
          }),
        );
      }
      if (url.includes(`/library/catalog/items/${itemId}/copies?`)) {
        return Promise.resolve(
          jsonResponse(200, {
            data: [{ id: copyId, itemId, archivedAt: null }],
            meta: { limit: 100, offset: 0, total: 1 },
          }),
        );
      }
      if (url.endsWith("/library/loans") && (init as RequestInit | undefined)?.method === "POST") {
        return Promise.resolve(
          jsonResponse(409, {
            error: { code: "COPY_UNAVAILABLE", message: "The copy is already on loan." },
          }),
        );
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();
    fireEvent.click(await screen.findByRole("button", { name: "Issue book" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Borrower profile UUID"), {
      target: { value: "a0b8b1c0-0000-4000-8000-000000000010" },
    });
    fireEvent.change(await within(dialog).findByLabelText("Book title"), {
      target: { value: itemId },
    });
    fireEvent.change(await within(dialog).findByLabelText("Active copy record"), {
      target: { value: copyId },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Issue book" }));

    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "This copy is already on loan. Select another copy.",
    );
    expect(within(dialog).queryByText(/issued successfully/i)).toBeNull();
  });

  it("confirms return and displays the server-recorded returned status and date", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    const loanId = "b0b8b1c0-0000-4000-8000-000000000001";
    const loan = {
      id: loanId,
      itemId: "b0b8b1c0-0000-4000-8000-000000000002",
      copyId: "b0b8b1c0-0000-4000-8000-000000000003",
      studentId: "b0b8b1c0-0000-4000-8000-000000000004",
      staffId: null,
      checkedOutAt: "2026-10-20T10:00:00.000Z",
      dueOn: "2026-10-30",
      returnedAt: null,
      renewalCount: 0,
    };
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.loans.read", "library.loans.manage", "library.reports.read"],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/library/loans?")) {
        return Promise.resolve(
          jsonResponse(200, { data: [loan], meta: { limit: 25, offset: 0, total: 1 } }),
        );
      }
      if (
        url.endsWith(`/library/loans/${loanId}/return`) &&
        (init as RequestInit | undefined)?.method === "POST"
      ) {
        return Promise.resolve(
          jsonResponse(200, {
            data: { ...loan, returnedAt: "2026-10-25T13:30:00.000Z" },
          }),
        );
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();

    fireEvent.click(await screen.findByRole("button", { name: /^Return loan/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Confirm return" })).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith(`/library/loans/${loanId}/return`) &&
          (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm return" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm return" }));

    expect(await within(dialog).findByText("Return confirmed by the server.")).toBeTruthy();
    expect(within(dialog).getByText("Returned")).toBeTruthy();
    expect(within(dialog).getByText(/25\/10\/2026/)).toBeTruthy();
    const returnCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(`/library/loans/${loanId}/return`) &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    if (!returnCall) throw new Error("Return request was not sent.");
    expect((returnCall[1] as RequestInit).body).toBeUndefined();
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input).endsWith(`/library/loans/${loanId}/return`) &&
          (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            String(input).includes("/library/loans?") &&
            (init as RequestInit | undefined)?.method !== "POST",
        ).length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        fetchMock.mock.calls.filter(([input]) => String(input).includes("/library/reports/loans?"))
          .length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  it("blocks return when active loans cannot be reloaded after a cached success", async () => {
    let activeLoanRequests = 0;
    let returnRequests = 0;
    const loanId = "b0b8b1c0-0000-4000-8000-000000000024";
    const loan = {
      id: loanId,
      itemId: "b0b8b1c0-0000-4000-8000-000000000025",
      copyId: "b0b8b1c0-0000-4000-8000-000000000026",
      studentId: "b0b8b1c0-0000-4000-8000-000000000027",
      staffId: null,
      checkedOutAt: "2026-10-20T10:00:00.000Z",
      dueOn: "2026-10-30",
      returnedAt: null,
      renewalCount: 0,
    };
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.loans.read", "library.loans.manage"],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname.endsWith("/library/loans") && url.searchParams.get("status") === "ACTIVE") {
        activeLoanRequests += 1;
        return Promise.resolve(
          activeLoanRequests === 1
            ? jsonResponse(200, {
                data: [loan],
                meta: { limit: 25, offset: 0, total: 1 },
              })
            : jsonResponse(503, { error: { message: "Loan service unavailable." } }),
        );
      }
      if (
        url.pathname.endsWith("/library/loans") &&
        url.searchParams.get("status") === "RETURNED"
      ) {
        return Promise.resolve(
          jsonResponse(200, { data: [], meta: { limit: 25, offset: 0, total: 0 } }),
        );
      }
      if (url.pathname.endsWith("/library/reports/loans")) {
        return Promise.resolve(
          jsonResponse(200, { data: { checkedOut: 1, active: 1, returned: 0, overdue: 0 } }),
        );
      }
      if (url.pathname.endsWith(`/library/loans/${loanId}/return`) && init?.method === "POST") {
        returnRequests += 1;
        return Promise.resolve(jsonResponse(200, { data: { ...loan, returnedAt: "2026-10-25" } }));
      }
      return Promise.resolve(jsonResponse(404, { error: { message: "Unexpected request" } }));
    });
    const { queryClient } = renderLibraryPage();

    fireEvent.click(await screen.findByRole("button", { name: `Return loan ${loanId}` }));
    const dialog = screen.getByRole("dialog");
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["school-data", "school-1", "/library/loans"],
      });
    });

    expect(
      await within(dialog).findByText(
        "Active loan data could not be verified. Reload it before recording a return or renewal.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole<HTMLButtonElement>("button", { name: "Confirm return" }).disabled,
    ).toBe(true);
    expect(returnRequests).toBe(0);
  });

  it("shows the server's already-returned rejection without changing the loan locally", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    const loanId = "b0b8b1c0-0000-4000-8000-000000000005";
    const loan = {
      id: loanId,
      itemId: "b0b8b1c0-0000-4000-8000-000000000006",
      copyId: "b0b8b1c0-0000-4000-8000-000000000007",
      studentId: "b0b8b1c0-0000-4000-8000-000000000008",
      staffId: null,
      checkedOutAt: "2026-10-20T10:00:00.000Z",
      dueOn: "2026-10-30",
      returnedAt: null,
      renewalCount: 0,
    };
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.loans.read", "library.loans.manage"],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/library/loans?")) {
        return Promise.resolve(
          jsonResponse(200, { data: [loan], meta: { limit: 25, offset: 0, total: 1 } }),
        );
      }
      if (
        url.endsWith(`/library/loans/${loanId}/return`) &&
        (init as RequestInit | undefined)?.method === "POST"
      ) {
        return Promise.resolve(
          jsonResponse(404, {
            error: {
              code: "RECORD_NOT_FOUND",
              message: "The requested active library loan was not found.",
            },
          }),
        );
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Return loan/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm return" }));

    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "This loan is no longer active. Refresh the list to see its current state.",
    );
    expect(within(dialog).queryByText("Return confirmed by the server.")).toBeNull();
  });

  it("renews an active loan without a request body and shows the updated server due date", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    const loanId = "b0b8b1c0-0000-4000-8000-000000000009";
    const loan = {
      id: loanId,
      itemId: "b0b8b1c0-0000-4000-8000-000000000010",
      copyId: "b0b8b1c0-0000-4000-8000-000000000011",
      studentId: null,
      staffId: "b0b8b1c0-0000-4000-8000-000000000012",
      checkedOutAt: "2026-10-20T10:00:00.000Z",
      dueOn: "2026-10-30",
      returnedAt: null,
      renewalCount: 0,
    };
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.loans.read", "library.loans.manage", "library.reports.read"],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/library/loans?")) {
        return Promise.resolve(
          jsonResponse(200, { data: [loan], meta: { limit: 25, offset: 0, total: 1 } }),
        );
      }
      if (
        url.endsWith(`/library/loans/${loanId}/renew`) &&
        (init as RequestInit | undefined)?.method === "POST"
      ) {
        return Promise.resolve(
          jsonResponse(200, { data: { ...loan, dueOn: "2026-11-13", renewalCount: 1 } }),
        );
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Renew loan/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Current due date")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm renewal" }));

    expect(await within(dialog).findByText("Loan renewed")).toBeTruthy();
    expect(within(dialog).getByText("30 Oct 2026")).toBeTruthy();
    expect(within(dialog).getByText("13 Nov 2026")).toBeTruthy();
    expect(within(dialog).getByText("1", { selector: "dd" })).toBeTruthy();
    const renewCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith(`/library/loans/${loanId}/renew`) &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    if (!renewCall) throw new Error("Renewal request was not sent.");
    expect((renewCall[1] as RequestInit).body).toBeUndefined();
  });

  it("shows the backend renewal-limit rejection without advancing the due date", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    const loanId = "b0b8b1c0-0000-4000-8000-000000000013";
    const loan = {
      id: loanId,
      itemId: "b0b8b1c0-0000-4000-8000-000000000014",
      copyId: "b0b8b1c0-0000-4000-8000-000000000015",
      studentId: "b0b8b1c0-0000-4000-8000-000000000016",
      staffId: null,
      checkedOutAt: "2026-10-20T10:00:00.000Z",
      dueOn: "2026-10-30",
      returnedAt: null,
      renewalCount: 1,
    };
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        name: "Authorized School",
        permissions: ["library.loans.read", "library.loans.manage"],
      },
    });
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/library/loans?")) {
        return Promise.resolve(
          jsonResponse(200, { data: [loan], meta: { limit: 25, offset: 0, total: 1 } }),
        );
      }
      if (
        url.endsWith(`/library/loans/${loanId}/renew`) &&
        (init as RequestInit | undefined)?.method === "POST"
      ) {
        return Promise.resolve(
          jsonResponse(409, {
            error: { code: "RENEWAL_LIMIT_REACHED", message: "Renewal cap reached." },
          }),
        );
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();
    fireEvent.click(await screen.findByRole("button", { name: /^Renew loan/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm renewal" }));

    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "This loan has reached the renewal limit configured by the school.",
    );
    expect(within(dialog).queryByText("Loan renewed")).toBeNull();
  });

  it("registers books with supported fields and prevents duplicate submissions", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    let resolveCreate!: (response: Response) => void;
    const createResponse = new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    });
    fetchMock.mockImplementation((input, init) => {
      if (
        String(input).endsWith("/library/catalog/items") &&
        (init as RequestInit | undefined)?.method === "POST"
      ) {
        return createResponse;
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();

    fireEvent.click(await screen.findByRole("button", { name: "Register book" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "New reference" },
    });
    fireEvent.change(within(dialog).getByLabelText("Author"), {
      target: { value: "A. Writer" },
    });
    fireEvent.change(within(dialog).getByLabelText("ISBN"), {
      target: { value: "9780000000001" },
    });
    fireEvent.change(within(dialog).getByLabelText("Category"), {
      target: { value: "category-1" },
    });
    const form = dialog.querySelector("form");
    if (!form) throw new Error("Book form was not rendered.");
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            String(input).endsWith("/library/catalog/items") &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toHaveLength(1);
    });
    const postCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/library/catalog/items") &&
        (init as RequestInit | undefined)?.method === "POST",
    );
    if (!postCall) throw new Error("Book registration request was not sent.");
    expect(JSON.parse(String((postCall[1] as RequestInit).body))).toEqual({
      title: "New reference",
      author: "A. Writer",
      isbn: "9780000000001",
      categoryId: "category-1",
    });

    resolveCreate(
      jsonResponse(201, {
        data: {
          id: "item-new",
          title: "New reference",
          author: "A. Writer",
          isbn: "9780000000001",
          categoryId: "category-1",
          archivedAt: null,
        },
      }),
    );
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(await screen.findByText("Registered “New reference”.")).toBeTruthy();
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          ([input, init]) =>
            String(input).includes("/library/catalog/items?") &&
            (init as RequestInit | undefined)?.method !== "POST",
        ).length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  it("edits an active book through PATCH without changing its category implicitly", async () => {
    const defaultFetch = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input, init) => {
      if (
        String(input).endsWith("/library/catalog/items/item-1") &&
        (init as RequestInit | undefined)?.method === "PATCH"
      ) {
        return Promise.resolve(
          jsonResponse(200, {
            data: {
              id: "item-1",
              title: "Updated reference",
              author: "School Library",
              isbn: null,
              categoryId: null,
              archivedAt: null,
            },
          }),
        );
      }
      return Promise.resolve(
        defaultFetch?.(input, init) ??
          jsonResponse(404, { error: { message: "Unexpected request" } }),
      );
    });
    renderLibraryPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit Reference book" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Title"), {
      target: { value: "Updated reference" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Updated “Updated reference”.")).toBeTruthy();
    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/library/catalog/items/item-1") &&
        (init as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();
    if (!patchCall) throw new Error("Book update request was not sent.");
    expect(JSON.parse(String((patchCall[1] as RequestInit).body))).toEqual({
      title: "Updated reference",
      author: "School Library",
      isbn: null,
    });
  });

  it("validates required title before making a create request", async () => {
    renderLibraryPage();
    fireEvent.click(await screen.findByRole("button", { name: "Register book" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "   " } });
    const form = dialog.querySelector("form");
    if (!form) throw new Error("Book form was not rendered.");
    fireEvent.submit(form);

    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Title is required and must be 240 characters or fewer.",
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/library/catalog/items") &&
          (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);
  });
});
