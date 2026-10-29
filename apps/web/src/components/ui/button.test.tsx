import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  afterEach(() => cleanup());

  it("keeps disabled actions inactive and includes a visible focus treatment", () => {
    const onClick = vi.fn();
    render(
      <Button aria-label="Save changes" disabled onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button.className).toContain("focus-visible:ring-offset-2");
    expect(button.className).toContain("focus-visible:ring-offset-background");

    fireEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });
});
