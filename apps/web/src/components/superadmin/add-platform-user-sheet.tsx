import { Info, UserRoundPlus } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
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
import { type NewPlatformUserDemo, platformUserDemoRoles } from "@/config/platform-user-demo-data";

const inputClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type AddPlatformUserSheetProps = {
  onAdd: (user: NewPlatformUserDemo) => void;
};

type FormErrors = Partial<Record<"name" | "email" | "roleLabel", string>>;

export function AddPlatformUserSheet({ onAdd }: AddPlatformUserSheetProps) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pendingPreview, setPendingPreview] = useState<NewPlatformUserDemo | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const roleLabel = String(formData.get("roleLabel") ?? "");
    const nextErrors: FormErrors = {};

    if (!name || name.length > 200) {
      nextErrors.name = "Enter a display name (up to 200 characters).";
    }
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Enter a valid email address (up to 320 characters).";
    }
    if (!platformUserDemoRoles.some((role) => role === roleLabel)) {
      nextErrors.roleLabel = "Choose one of the demonstration labels.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setPendingPreview({ name, email, roleLabel });
  }

  function confirmPreview() {
    if (!pendingPreview) return;
    onAdd(pendingPreview);
    formRef.current?.reset();
    setPendingPreview(null);
    setErrors({});
    setOpen(false);
  }

  return (
    <>
      <Sheet
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setErrors({});
        }}
        open={open}
      >
        <SheetTrigger asChild>
          <Button>
            <UserRoundPlus aria-hidden="true" />
            Add demo user
          </Button>
        </SheetTrigger>
        <SheetContent
          aria-describedby="platform-user-form-description"
          className="w-full overflow-y-auto sm:max-w-xl"
          side="right"
        >
          <div className="space-y-2 pr-8">
            <SheetTitle>Add platform user preview</SheetTitle>
            <SheetDescription id="platform-user-form-description">
              Create a temporary demonstration entry only. This does not create an account or grant
              access.
            </SheetDescription>
          </div>

          <form className="mt-7 space-y-6" noValidate onSubmit={handleSubmit} ref={formRef}>
            <div className="grid gap-4">
              <label className="space-y-1.5" htmlFor="platform-user-name">
                <span className="text-xs font-medium text-foreground">Display name</span>
                <input
                  aria-describedby={errors.name ? "platform-user-name-error" : undefined}
                  aria-invalid={Boolean(errors.name)}
                  autoComplete="off"
                  className={inputClassName}
                  id="platform-user-name"
                  maxLength={200}
                  name="name"
                  onChange={() => setErrors((current) => ({ ...current, name: undefined }))}
                  placeholder="Enter a display name"
                  required
                />
                {errors.name && (
                  <span
                    className="block text-xs text-destructive"
                    id="platform-user-name-error"
                    role="alert"
                  >
                    {errors.name}
                  </span>
                )}
              </label>

              <label className="space-y-1.5" htmlFor="platform-user-email">
                <span className="text-xs font-medium text-foreground">Email address</span>
                <input
                  aria-describedby={errors.email ? "platform-user-email-error" : undefined}
                  aria-invalid={Boolean(errors.email)}
                  autoComplete="off"
                  className={inputClassName}
                  id="platform-user-email"
                  maxLength={320}
                  name="email"
                  onChange={() => setErrors((current) => ({ ...current, email: undefined }))}
                  placeholder="user@example.test"
                  required
                  type="email"
                />
                {errors.email && (
                  <span
                    className="block text-xs text-destructive"
                    id="platform-user-email-error"
                    role="alert"
                  >
                    {errors.email}
                  </span>
                )}
              </label>

              <label className="space-y-1.5" htmlFor="platform-user-role">
                <span className="text-xs font-medium text-foreground">
                  Demonstration role label
                </span>
                <select
                  aria-describedby={errors.roleLabel ? "platform-user-role-error" : undefined}
                  aria-invalid={Boolean(errors.roleLabel)}
                  className={inputClassName}
                  defaultValue={platformUserDemoRoles[1]}
                  id="platform-user-role"
                  name="roleLabel"
                  onChange={() =>
                    setErrors((current) => ({
                      ...current,
                      roleLabel: undefined,
                    }))
                  }
                >
                  {platformUserDemoRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                {errors.roleLabel && (
                  <span
                    className="block text-xs text-destructive"
                    id="platform-user-role-error"
                    role="alert"
                  >
                    {errors.roleLabel}
                  </span>
                )}
              </label>
            </div>

            <div className="flex gap-3 rounded-lg border bg-muted/30 p-3.5" role="note">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-xs leading-5 text-muted-foreground">
                Role labels are illustrative only. No identity, platform assignment, invitation, or
                permission is created. The entry exists only in this page session.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full" type="submit">
                Review preview entry
              </Button>
              <Button
                className="w-full"
                onClick={() => {
                  formRef.current?.reset();
                  setErrors({});
                  setOpen(false);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingPreview(null);
          }
        }}
        open={pendingPreview !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm preview entry</DialogTitle>
            <DialogDescription>
              This adds a temporary mock row to the current page session only. It will not create a
              platform account, apply a role, grant permission, or send an invitation.
            </DialogDescription>
          </DialogHeader>
          {pendingPreview && (
            <dl className="divide-y rounded-md border text-sm">
              <div className="grid gap-1 px-3 py-2 sm:grid-cols-[120px_1fr]">
                <dt className="text-muted-foreground">Name</dt>
                <dd>{pendingPreview.name}</dd>
              </div>
              <div className="grid gap-1 px-3 py-2 sm:grid-cols-[120px_1fr]">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="break-all">{pendingPreview.email}</dd>
              </div>
              <div className="grid gap-1 px-3 py-2 sm:grid-cols-[120px_1fr]">
                <dt className="text-muted-foreground">Demo label</dt>
                <dd>{pendingPreview.roleLabel}</dd>
              </div>
            </dl>
          )}
          <DialogFooter>
            <Button onClick={() => setPendingPreview(null)} type="button" variant="outline">
              Go back
            </Button>
            <Button onClick={confirmPreview} type="button">
              Add page-session preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
