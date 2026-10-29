import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/client";
import { LoginPage } from "./login-page";

const authMock = vi.hoisted(() => ({
  login: vi.fn(),
  error: null as string | null,
}));

vi.mock("@/app/auth-provider", () => ({
  useAuth: () => authMock,
}));

function loginForm() {
  const form = screen.getByRole("button", { name: "Sign in" }).closest("form");
  if (!form) throw new Error("The sign-in form was not rendered.");
  return form;
}

describe("LoginPage", () => {
  beforeEach(() => {
    authMock.login.mockReset();
    authMock.error = null;
  });

  afterEach(cleanup);

  it("provides constrained, accessible email and password fields", () => {
    render(<LoginPage />);

    const email = screen.getByRole("textbox", { name: "Email" });
    const password = screen.getByLabelText("Password");

    expect(email.getAttribute("type")).toBe("email");
    expect(email.hasAttribute("required")).toBe(true);
    expect(email.getAttribute("maxlength")).toBe("320");
    expect(password.getAttribute("type")).toBe("password");
    expect(password.hasAttribute("required")).toBe(true);
    expect(password.getAttribute("maxlength")).toBe("1024");
  });

  it("shows a generic invalid-credentials message instead of server details", async () => {
    authMock.login.mockRejectedValue(
      new ApiClientError("A private or server-provided message.", 401, "INVALID_CREDENTIALS"),
    );
    render(<LoginPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "admin@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "incorrect-password" },
    });

    fireEvent.submit(loginForm());

    expect((await screen.findByRole("alert")).textContent).toBe("Email or password is incorrect.");
    expect(screen.queryByText("A private or server-provided message.")).toBeNull();
  });

  it("does not expose internal details for unexpected sign-in errors", async () => {
    authMock.login.mockRejectedValue(
      new ApiClientError("Database connection string leaked by upstream.", 500, "SERVER_ERROR"),
    );
    render(<LoginPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "admin@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password" },
    });

    fireEvent.submit(loginForm());

    expect((await screen.findByRole("alert")).textContent).toBe(
      "We couldn't sign you in. Check your details and try again.",
    );
    expect(screen.queryByText("Database connection string leaked by upstream.")).toBeNull();
  });

  it("prevents duplicate requests and disables fields while sign-in is pending", async () => {
    let resolveLogin!: () => void;
    authMock.login.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveLogin = resolve;
      }),
    );
    render(<LoginPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "admin@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password" },
    });

    const form = loginForm();
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(authMock.login).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Signing in..." }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByRole("textbox", { name: "Email" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Password").hasAttribute("disabled")).toBe(true);

    await act(async () => resolveLogin());
  });

  it("displays the session-expired state without exposing backend detail", () => {
    authMock.error = "Your session has expired. Sign in again.";

    render(<LoginPage />);

    expect(screen.getByRole("alert").textContent).toBe("Your session has expired. Sign in again.");
  });
});
