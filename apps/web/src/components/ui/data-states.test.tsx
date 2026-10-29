import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnauthorizedState,
} from "./data-states";

describe("data states", () => {
  afterEach(() => cleanup());

  it("shows an accessible loading message", () => {
    render(<LoadingState message="Loading students..." />);

    expect(screen.getByRole("status").textContent).toContain("Loading students...");
  });

  it("shows an accessible successful empty state", () => {
    render(
      <EmptyState title="No student records" description="Student profiles will appear here." />,
    );

    expect(screen.getByRole("status").textContent).toContain("No student records");
    expect(screen.getByRole("status").textContent).toContain("Student profiles will appear here.");
  });

  it("shows a user-friendly accessible error without server details", () => {
    render(<ErrorState message="Students could not be loaded." />);

    expect(screen.getByRole("alert").textContent).toContain("Students could not be loaded.");
    expect(screen.queryByText(/database password|stack trace/i)).toBeNull();
  });

  it("calls retry when the retry button is activated", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not render retry when no retry action is provided", () => {
    render(<ErrorState />);

    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("communicates denied access without implying a role or permission grant", () => {
    render(
      <UnauthorizedState
        description="The server did not authorize this workspace."
        title="Workspace unavailable"
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("Workspace unavailable");
    expect(screen.getByRole("alert").textContent).toContain(
      "The server did not authorize this workspace.",
    );
  });
});
