import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "@/test-utils/mock-response";
import { AdmissionsPipeline } from "./admissions-pipeline";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({
    school: {
      id: "school-1",
      permissions: [
        "admissions.application.read",
        "students.profile.read",
        "guardians.profile.read",
      ],
    },
  })),
}));

vi.mock("@/app/auth-provider", () => ({ useAuth: useAuthMock }));

const fetchMock = vi.fn<typeof fetch>();

function renderPipeline() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdmissionsPipeline />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdmissionsPipeline", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        permissions: [
          "admissions.application.read",
          "students.profile.read",
          "guardians.profile.read",
        ],
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), "http://local");
      const status = url.searchParams.get("status");
      const total = status === "UNDER_REVIEW" ? 4 : 0;
      return Promise.resolve(
        jsonResponse(200, {
          data: [],
          meta: { total, limit: 1, offset: 0 },
        }),
      );
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads exact server-filtered status totals and provides authorized navigation", async () => {
    renderPipeline();

    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: "Under review applications" }).textContent,
      ).toContain("4");
    });
    expect(screen.getByRole("group", { name: "Admitted applications" }).textContent).toContain("0");
    expect(screen.getByRole("link", { name: "Review applications" }).getAttribute("href")).toBe(
      "/admissions",
    );
    expect(screen.getByRole("link", { name: "Student registrations" }).getAttribute("href")).toBe(
      "/students",
    );
    expect(
      screen.getByText("Guardian records are available through student profiles."),
    ).toBeTruthy();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));
    expect(
      fetchMock.mock.calls
        .map(([input]) => new URL(String(input), "http://local").searchParams.get("status"))
        .sort(),
    ).toEqual([
      "ACCEPTED",
      "ADMITTED",
      "DRAFT",
      "REJECTED",
      "SUBMITTED",
      "UNDER_REVIEW",
      "WITHDRAWN",
    ]);
  });

  it("shows loading and successful zero values without fabricating records", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    renderPipeline();
    expect(
      (await screen.findByRole("group", { name: "Draft applications" })).textContent,
    ).toContain("Loading...");

    cleanup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(200, {
          data: [],
          meta: { total: 0, limit: 1, offset: 0 },
        }),
      ),
    );
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdmissionsPipeline />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Draft applications" }).textContent).toContain("0");
    });
  });

  it("reports a failed status request and retries only that total", async () => {
    let reviewCalls = 0;
    fetchMock.mockImplementation((input) => {
      const url = new URL(String(input), "http://local");
      if (url.searchParams.get("status") === "UNDER_REVIEW") {
        reviewCalls += 1;
        return reviewCalls === 1
          ? Promise.resolve(jsonResponse(503, { error: { message: "Unavailable" } }))
          : Promise.resolve(
              jsonResponse(200, {
                data: [],
                meta: { total: 3, limit: 1, offset: 0 },
              }),
            );
      }
      return Promise.resolve(
        jsonResponse(200, {
          data: [],
          meta: { total: 0, limit: 1, offset: 0 },
        }),
      );
    });
    renderPipeline();

    const retry = await screen.findByRole("button", { name: "Retry under review count" });
    expect(screen.getByRole("alert").textContent).toContain("status totals could not be loaded");
    fireEvent.click(retry);
    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: "Under review applications" }).textContent,
      ).toContain("3");
    });
  });

  it("does not request or expose application totals without permission", () => {
    useAuthMock.mockReturnValue({ school: { id: "school-1", permissions: [] } });
    renderPipeline();

    expect(
      screen.getByText("Status totals are unavailable without admissions read permission."),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Review applications" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not imply guardian records are reachable without student access", () => {
    useAuthMock.mockReturnValue({
      school: {
        id: "school-1",
        permissions: ["admissions.application.read", "guardians.profile.read"],
      },
    });
    renderPipeline();

    expect(screen.getByRole("link", { name: "Review applications" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Student registrations" })).toBeNull();
    expect(
      screen.queryByText("Guardian records are available through student profiles."),
    ).toBeNull();
  });
});
