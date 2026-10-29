import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformSchool, PlatformSchoolStatus } from "@/lib/api/platform-types";
import { jsonResponse } from "@/test-utils/mock-response";
import { PlatformSchoolDetailsPage } from "./platform-school-details-page";

const fetchMock = vi.fn<typeof fetch>();

const originalSchool: PlatformSchool = {
  id: "school-1",
  name: "North School",
  contactEmail: "office@example.test",
  contactPhone: null,
  status: "ACTIVE",
  createdAt: "2026-10-20T00:00:00.000Z",
  updatedAt: "2026-10-20T00:00:00.000Z",
};

function renderDetailsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter initialEntries={["/superadmin/schools/school-1"]}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/superadmin/schools/:schoolId" element={<PlatformSchoolDetailsPage />} />
        </Routes>
      </QueryClientProvider>
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

describe("PlatformSchoolDetailsPage", () => {
  it("shows approved school metadata and provides reset, cancel, validation, and confirmation flows", async () => {
    let school: PlatformSchool = { ...originalSchool };
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/platform/schools/school-1/status") && init?.method === "PATCH") {
        school = {
          ...school,
          status: (JSON.parse(String(init.body)) as { status: PlatformSchoolStatus }).status,
          updatedAt: "2026-10-25T00:00:00.000Z",
        };
        return jsonResponse(200, { data: school });
      }
      if (url.endsWith("/platform/schools/school-1") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as {
          name: string;
          contactEmail: string | null;
          contactPhone: string | null;
        };
        school = { ...school, ...body, updatedAt: "2026-10-25T00:00:00.000Z" };
        return jsonResponse(200, { data: school });
      }
      if (url.endsWith("/platform/schools/school-1")) {
        return jsonResponse(200, { data: school });
      }
      throw new Error(`Unexpected endpoint: ${url}`);
    });

    renderDetailsPage();

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/platform/schools/school-1",
        expect.any(Object),
      ),
    );
    expect(await screen.findByRole("heading", { name: "North School" })).toBeTruthy();
    expect(screen.getByText("school-1")).toBeTruthy();
    expect(screen.getByText("office@example.test")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "School detail sections" })).toBeTruthy();
    expect(document.getElementById("overview")?.className).toContain("scroll-mt-20");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/platform/schools/school-1", expect.any(Object));

    fireEvent.click(screen.getByRole("button", { name: "Edit contact details" }));
    const email = screen.getByLabelText("Contact email");
    fireEvent.change(email, { target: { value: "invalid" } });
    const contactForm = screen.getByRole("button", { name: "Save school details" }).closest("form");
    if (!contactForm) throw new Error("The school contact form was not rendered.");
    fireEvent.submit(contactForm);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/platform/schools/school-1") && init?.method === "PATCH",
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Reset changes" }));
    expect(email).toHaveProperty("value", "office@example.test");
    fireEvent.change(email, { target: { value: "updated@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save school details" }));
    expect(await screen.findByText("School contact details saved.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/platform/schools/school-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          name: "North School",
          contactEmail: "updated@example.test",
          contactPhone: null,
        }),
      }),
    );

    fireEvent.change(screen.getByLabelText("New status"), { target: { value: "SUSPENDED" } });
    fireEvent.click(screen.getByRole("button", { name: "Review status change" }));
    expect(screen.getByText("Confirm changing this school from ACTIVE to SUSPENDED?")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith("/platform/schools/school-1/status") && init?.method === "PATCH",
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel status change" }));
    expect(screen.queryByText("Confirm changing this school from ACTIVE to SUSPENDED?")).toBeNull();

    fireEvent.change(screen.getByLabelText("New status"), { target: { value: "SUSPENDED" } });
    fireEvent.click(screen.getByRole("button", { name: "Review status change" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm SUSPENDED" }));
    expect(await screen.findByText("School status updated to SUSPENDED.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/platform/schools/school-1/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "SUSPENDED" }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers a retry when school details cannot be loaded", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(503, {
          error: { code: "SERVICE_UNAVAILABLE", message: "School details are unavailable." },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: originalSchool }));

    renderDetailsPage();

    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "North School" })).toBeTruthy();
  });
});
