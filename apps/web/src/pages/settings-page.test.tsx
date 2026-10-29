import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/client";
import { SettingsPage } from "./settings-page";

const settingsMocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  useSchoolData: vi.fn(),
  updateSchoolName: vi.fn(),
  permissions: ["school.profile.read", "school.profile.update"] as string[],
  profile: null as {
    data: { data: Record<string, unknown> } | undefined;
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    refetch: ReturnType<typeof vi.fn>;
  } | null,
}));

vi.mock("@/app/auth-provider", () => ({
  useAuth: () => ({
    school: {
      id: "school-1",
      name: "Elimara Academy",
      permissions: settingsMocks.permissions,
    },
    updateSchoolName: settingsMocks.updateSchoolName,
  }),
}));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: settingsMocks.apiRequest,
}));

vi.mock("@/lib/api/school-data", () => ({
  useSchoolData: settingsMocks.useSchoolData,
}));

const savedProfile = {
  id: "school-1",
  name: "Elimara Academy",
  contactEmail: "office@example.test",
  contactPhone: "123456789",
  status: "ACTIVE",
  updatedAt: "2026-10-24T10:00:00.000Z",
};

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

function profileForm() {
  const form = screen.getByRole("button", { name: /Save profile|Saving\.\.\./ }).closest("form");
  if (!form) throw new Error("The school profile form was not rendered.");
  return form;
}

beforeEach(() => {
  settingsMocks.permissions = ["school.profile.read", "school.profile.update"];
  settingsMocks.apiRequest.mockReset();
  settingsMocks.updateSchoolName.mockReset();
  settingsMocks.apiRequest.mockResolvedValue({ data: savedProfile });
  settingsMocks.profile = {
    data: { data: savedProfile },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  settingsMocks.useSchoolData.mockReset();
  settingsMocks.useSchoolData.mockImplementation(() => settingsMocks.profile);
});

afterEach(() => {
  cleanup();
});

describe("SettingsPage", () => {
  it("groups the supported school profile and contact fields with accessible labels", () => {
    renderSettings();

    expect(screen.getByRole("heading", { name: "School profile" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Contact details" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "School name" }).getAttribute("maxlength")).toBe(
      "200",
    );
    expect(screen.getByRole("textbox", { name: "Contact email" }).getAttribute("maxlength")).toBe(
      "320",
    );
    expect(screen.getByRole("textbox", { name: "Contact phone" }).getAttribute("maxlength")).toBe(
      "40",
    );
  });

  it("shows inline validation messages and does not submit invalid profile data", () => {
    renderSettings();
    fireEvent.change(screen.getByRole("textbox", { name: "School name" }), {
      target: { value: "   " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Contact email" }), {
      target: { value: "invalid-email" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Contact phone" }), {
      target: { value: "123" },
    });

    fireEvent.submit(profileForm());

    expect(screen.getByText("Enter a school name.")).toBeTruthy();
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByText("Contact phone must be at least 7 characters.")).toBeTruthy();
    expect(screen.getByText("Enter a school name.").getAttribute("role")).toBe("alert");
    expect(screen.getByText("Enter a valid email address.").getAttribute("role")).toBe("alert");
    expect(
      screen.getByText("Contact phone must be at least 7 characters.").getAttribute("role"),
    ).toBe("alert");
    expect(screen.getByRole("textbox", { name: "School name" }).getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(settingsMocks.apiRequest).not.toHaveBeenCalled();
  });

  it("sends the supported fields, prevents duplicate saves, and shows the saving and success states", async () => {
    let resolveSave!: (value: { data: typeof savedProfile }) => void;
    settingsMocks.apiRequest.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderSettings();
    fireEvent.change(screen.getByRole("textbox", { name: "School name" }), {
      target: { value: "Updated Academy" },
    });

    const form = profileForm();
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(settingsMocks.apiRequest).toHaveBeenCalledTimes(1);
    expect(settingsMocks.apiRequest).toHaveBeenCalledWith("/schools/school-1", {
      method: "PATCH",
      body: {
        name: "Updated Academy",
        contactEmail: "office@example.test",
        contactPhone: "123456789",
      },
    });
    expect(screen.getByRole("button", { name: "Saving..." }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("textbox", { name: "School name" }).hasAttribute("disabled")).toBe(
      true,
    );

    await act(async () => {
      resolveSave({ data: { ...savedProfile, name: "Updated Academy" } });
    });

    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getByText("School profile saved.")).toBeTruthy();
    expect(settingsMocks.updateSchoolName).toHaveBeenCalledWith("school-1", "Updated Academy");
    expect(screen.getByRole("button", { name: "Save profile" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("shows save failures while preserving the unsaved draft", async () => {
    settingsMocks.apiRequest.mockRejectedValue(
      new ApiClientError("The school profile could not be saved.", 409, "CONFLICT"),
    );
    renderSettings();
    fireEvent.change(screen.getByRole("textbox", { name: "School name" }), {
      target: { value: "Draft Academy" },
    });

    fireEvent.submit(profileForm());

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "School name" }) as HTMLInputElement).value).toBe(
      "Draft Academy",
    );
    expect(screen.getByText("You have unsaved changes.")).toBeTruthy();
  });

  it("discards draft edits when Cancel is selected", () => {
    renderSettings();
    fireEvent.change(screen.getByRole("textbox", { name: "School name" }), {
      target: { value: "Draft Academy" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect((screen.getByRole("textbox", { name: "School name" }) as HTMLInputElement).value).toBe(
      "Elimara Academy",
    );
    expect(screen.queryByText("You have unsaved changes.")).toBeNull();
    expect(settingsMocks.apiRequest).not.toHaveBeenCalled();
  });

  it("preserves a dirty draft when profile data is refreshed", () => {
    const view = renderSettings();
    fireEvent.change(screen.getByRole("textbox", { name: "School name" }), {
      target: { value: "Local draft" },
    });
    const currentProfile = settingsMocks.profile;
    if (!currentProfile) throw new Error("The school profile mock was not initialized.");
    settingsMocks.profile = {
      ...currentProfile,
      data: { data: { ...savedProfile, name: "Server refresh" } },
    };

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage />
      </QueryClientProvider>,
    );

    expect((screen.getByRole("textbox", { name: "School name" }) as HTMLInputElement).value).toBe(
      "Local draft",
    );
  });

  it("keeps profile fields read-only and hides save controls without update permission", () => {
    settingsMocks.permissions = ["school.profile.read"];
    renderSettings();

    expect(screen.getByRole("status").textContent).toBe(
      "You have view-only access to the school profile.",
    );
    expect(screen.getByRole("textbox", { name: "School name" }).hasAttribute("readonly")).toBe(
      true,
    );
    expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
    expect(settingsMocks.apiRequest).not.toHaveBeenCalled();
  });

  it("does not request or reveal the profile without read permission", () => {
    settingsMocks.permissions = [];
    renderSettings();

    expect(screen.getByRole("alert").textContent).toContain("does not include permission to view");
    expect(settingsMocks.useSchoolData).toHaveBeenCalledWith("", {}, { enabled: false });
    expect(screen.queryByRole("textbox", { name: "School name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
  });
});
