import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./sheet";

const sheetSides = [
  ["top", "data-[state=open]:slide-in-from-top", "data-[state=closed]:slide-out-to-top"],
  ["right", "data-[state=open]:slide-in-from-right", "data-[state=closed]:slide-out-to-right"],
  ["bottom", "data-[state=open]:slide-in-from-bottom", "data-[state=closed]:slide-out-to-bottom"],
  ["left", "data-[state=open]:slide-in-from-left", "data-[state=closed]:slide-out-to-left"],
] as const;

describe("SheetContent", () => {
  afterEach(() => cleanup());

  it.each(sheetSides)(
    "positions and animates the %s side",
    async (side, openAnimation, closeAnimation) => {
      render(
        <Sheet defaultOpen>
          <SheetContent side={side}>
            <SheetTitle>Sheet details</SheetTitle>
          </SheetContent>
        </Sheet>,
      );

      const content = await screen.findByRole("dialog", { name: "Sheet details" });
      expect(content.className).toContain(openAnimation);
      expect(content.className).toContain(closeAnimation);
    },
  );

  it("closes with Escape and restores focus to its trigger", async () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <Button>Open sheet</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle>Sheet details</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    const trigger = screen.getByRole("button", { name: "Open sheet" });
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Sheet details" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(document.activeElement).toBe(trigger);
  });
});
