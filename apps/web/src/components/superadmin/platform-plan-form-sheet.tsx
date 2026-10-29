import { Pencil, Plus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { RequestError } from "@/components/api/request-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { PlatformPlan } from "@/lib/api/platform-types";

export type PlatformPlanInput = {
  code: string;
  name: string;
  description?: string | null;
  entitlements: Record<string, string | number | boolean>;
  active?: boolean;
};

type PlatformPlanFormSheetProps = {
  plan?: PlatformPlan;
  error: Error | null;
  isPending: boolean;
  onSave(input: PlatformPlanInput): Promise<void>;
};

const inputClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function parseEntitlements(
  value: string,
): { data: Record<string, string | number | boolean> } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { error: "Enter entitlements as a valid JSON object." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { error: "Entitlements must be a JSON object." };
  }
  const entries = Object.entries(parsed);
  if (entries.length > 100) return { error: "At most 100 entitlement entries are allowed." };

  const result: Record<string, string | number | boolean> = {};
  for (const [key, item] of entries) {
    if (!/^[a-z][a-z0-9_.-]{0,79}$/.test(key)) {
      return {
        error: "Entitlement keys must start with a lowercase letter and use supported characters.",
      };
    }
    if (typeof item === "string") {
      if (item.length > 250)
        return { error: "Entitlement text values must be 250 characters or fewer." };
      result[key] = item;
    } else if (typeof item === "boolean") {
      result[key] = item;
    } else if (typeof item === "number" && Number.isFinite(item) && item >= 0) {
      result[key] = item;
    } else {
      return {
        error: "Entitlement values must be strings, booleans, or non-negative finite numbers.",
      };
    }
  }
  return { data: result };
}

export function PlatformPlanFormSheet({
  plan,
  error,
  isPending,
  onSave,
}: PlatformPlanFormSheetProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entitlements, setEntitlements] = useState("{}");
  const [active, setActive] = useState(true);
  const [validationError, setValidationError] = useState("");
  const [pendingInput, setPendingInput] = useState<PlatformPlanInput | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(plan?.code ?? "");
    setName(plan?.name ?? "");
    setDescription(plan?.description ?? "");
    setEntitlements(JSON.stringify(plan?.entitlements ?? {}, null, 2));
    setActive(plan?.active ?? true);
    setValidationError("");
    setPendingInput(null);
  }, [open, plan]);

  function resetForm() {
    setCode(plan?.code ?? "");
    setName(plan?.name ?? "");
    setDescription(plan?.description ?? "");
    setEntitlements(JSON.stringify(plan?.entitlements ?? {}, null, 2));
    setActive(plan?.active ?? true);
    setValidationError("");
    setPendingInput(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = name.trim();
    const normalizedDescription = description.trim();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,79}$/.test(normalizedCode)) {
      setValidationError(
        "Use 2–80 characters for the plan code: uppercase letters, numbers, _ or -.",
      );
      return;
    }
    if (!normalizedName || normalizedName.length > 160) {
      setValidationError("Enter a plan name (up to 160 characters).");
      return;
    }
    if (normalizedDescription.length > 1000) {
      setValidationError("Plan description must be 1,000 characters or fewer.");
      return;
    }
    const parsedEntitlements = parseEntitlements(entitlements);
    if ("error" in parsedEntitlements) {
      setValidationError(parsedEntitlements.error);
      return;
    }

    const input: PlatformPlanInput = {
      code: normalizedCode,
      name: normalizedName,
      entitlements: parsedEntitlements.data,
      ...(plan
        ? { description: normalizedDescription || null }
        : normalizedDescription
          ? { description: normalizedDescription }
          : {}),
      ...(plan ? { active } : {}),
    };
    setPendingInput(input);
  }

  async function confirmSave() {
    if (!pendingInput) return;
    try {
      await onSave(pendingInput);
      setPendingInput(null);
      setOpen(false);
    } catch {
      return;
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setPendingInput(null);
        }}
      >
        <SheetTrigger asChild>
          <Button size={plan ? "sm" : "default"} variant={plan ? "outline" : "default"}>
            {plan ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {plan ? "Edit plan" : "Add plan"}
          </Button>
        </SheetTrigger>
        <SheetContent
          aria-describedby="platform-plan-form-description"
          className="w-full overflow-y-auto sm:max-w-xl"
          side="right"
        >
          <div className="space-y-2 pr-8">
            <SheetTitle>{plan ? "Edit plan metadata" : "Create plan"}</SheetTitle>
            <SheetDescription id="platform-plan-form-description">
              Plans are metadata only. Entitlements do not enforce access, and this form does not
              configure pricing or billing.
            </SheetDescription>
          </div>
          <form
            className="mt-7 space-y-4"
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label className="block space-y-1.5">
              <span className="text-xs font-medium">Plan code</span>
              <input
                className={inputClassName}
                maxLength={80}
                onChange={(event) => setCode(event.target.value)}
                required
                value={code}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium">Plan name</span>
              <input
                className={inputClassName}
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium">Description</span>
              <textarea
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={1000}
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium">Entitlement metadata (JSON)</span>
              <textarea
                aria-label="Entitlement metadata JSON"
                className="min-h-36 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setEntitlements(event.target.value)}
                spellCheck={false}
                value={entitlements}
              />
              <span className="block text-xs text-muted-foreground">
                Up to 100 keys; values must be strings, booleans, or non-negative numbers.
              </span>
            </label>
            {plan && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                  type="checkbox"
                />
                Active (inactive plans cannot receive new assignments)
              </label>
            )}
            {validationError && (
              <p className="text-sm text-destructive" role="alert">
                {validationError}
              </p>
            )}
            <RequestError error={error} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full" disabled={isPending} type="submit">
                Review plan changes
              </Button>
              <Button
                className="w-full"
                disabled={isPending}
                onClick={resetForm}
                type="button"
                variant="outline"
              >
                Reset
              </Button>
              <Button
                className="w-full"
                disabled={isPending}
                onClick={() => setOpen(false)}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isPending) setPendingInput(null);
        }}
        open={pendingInput !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {plan ? "Confirm plan metadata update" : "Confirm plan creation"}
            </DialogTitle>
            <DialogDescription>
              Review these values before submitting the documented plan metadata operation. This
              changes no pricing, billing, school access, or entitlement enforcement.
            </DialogDescription>
          </DialogHeader>
          {pendingInput && (
            <dl className="divide-y rounded-md border text-sm">
              <div className="grid gap-1 px-3 py-2 sm:grid-cols-[130px_1fr]">
                <dt className="text-muted-foreground">Plan code</dt>
                <dd className="font-mono">{pendingInput.code}</dd>
              </div>
              <div className="grid gap-1 px-3 py-2 sm:grid-cols-[130px_1fr]">
                <dt className="text-muted-foreground">Plan name</dt>
                <dd>{pendingInput.name}</dd>
              </div>
              <div className="grid gap-1 px-3 py-2 sm:grid-cols-[130px_1fr]">
                <dt className="text-muted-foreground">Description</dt>
                <dd className="break-all">{pendingInput.description || "Not provided"}</dd>
              </div>
              <div className="grid gap-1 px-3 py-2 sm:grid-cols-[130px_1fr]">
                <dt className="text-muted-foreground">Entitlement metadata</dt>
                <dd className="break-all font-mono text-xs">
                  {JSON.stringify(pendingInput.entitlements)}
                </dd>
              </div>
              {plan && (
                <div className="grid gap-1 px-3 py-2 sm:grid-cols-[130px_1fr]">
                  <dt className="text-muted-foreground">Active</dt>
                  <dd>{pendingInput.active ? "Yes" : "No"}</dd>
                </div>
              )}
            </dl>
          )}
          {error && <RequestError error={error} />}
          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => setPendingInput(null)}
              type="button"
              variant="outline"
            >
              Go back
            </Button>
            <Button disabled={isPending} onClick={() => void confirmSave()} type="button">
              {isPending ? "Saving plan..." : plan ? "Confirm metadata update" : "Confirm creation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
