import { Info, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { NewDemoSchool } from "@/config/superadmin-demo-data";

const inputClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

type AddSchoolSheetProps = {
  onAdd: (school: NewDemoSchool) => void;
};

type SchoolFormErrors = Partial<Record<"name" | "contactEmail" | "contactPhone", string>>;

export function AddSchoolSheet({ onAdd }: AddSchoolSheetProps) {
  const [open, setOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<SchoolFormErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const contactEmail = String(formData.get("contactEmail") ?? "")
      .trim()
      .toLowerCase();
    const contactPhone = String(formData.get("contactPhone") ?? "").trim();

    if (!name) {
      setValidationErrors({ name: "Enter a school name." });
      return;
    }
    if (
      contactEmail &&
      (contactEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    ) {
      setValidationErrors({
        contactEmail: "Enter a valid email address (up to 320 characters).",
      });
      return;
    }
    if (contactPhone && contactPhone.length < 7) {
      setValidationErrors({
        contactPhone: "Enter a phone number with at least 7 characters.",
      });
      return;
    }
    if (contactPhone.length > 40) {
      setValidationErrors({
        contactPhone: "Phone number must be 40 characters or fewer.",
      });
      return;
    }

    onAdd({
      name,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
    });
    form.reset();
    setValidationErrors({});
    setOpen(false);
  }

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setValidationErrors({});
      }}
      open={open}
    >
      <SheetTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Add school
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby="school-form-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-1 pr-8">
          <SheetTitle>Add school</SheetTitle>
          <SheetDescription id="school-form-description">
            Preview only. School details are not saved.
          </SheetDescription>
        </div>

        <form className="mt-7 space-y-6" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">School name</span>
              <input
                autoComplete="organization"
                className={inputClassName}
                aria-describedby={validationErrors.name ? "school-name-error" : undefined}
                aria-invalid={Boolean(validationErrors.name)}
                maxLength={200}
                name="name"
                onChange={() =>
                  setValidationErrors((current) => ({
                    ...current,
                    name: undefined,
                  }))
                }
                placeholder="Enter school name"
                required
              />
              {validationErrors.name && (
                <span
                  className="block text-xs text-destructive"
                  id="school-name-error"
                  role="alert"
                >
                  {validationErrors.name}
                </span>
              )}
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">Contact email</span>
              <input
                autoComplete="email"
                className={inputClassName}
                aria-describedby={validationErrors.contactEmail ? "school-email-error" : undefined}
                aria-invalid={Boolean(validationErrors.contactEmail)}
                maxLength={320}
                name="contactEmail"
                onChange={() =>
                  setValidationErrors((current) => ({
                    ...current,
                    contactEmail: undefined,
                  }))
                }
                placeholder="name@example.com"
                type="email"
              />
              {validationErrors.contactEmail && (
                <span
                  className="block text-xs text-destructive"
                  id="school-email-error"
                  role="alert"
                >
                  {validationErrors.contactEmail}
                </span>
              )}
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-foreground">Contact phone</span>
              <input
                autoComplete="tel"
                className={inputClassName}
                aria-describedby={validationErrors.contactPhone ? "school-phone-error" : undefined}
                aria-invalid={Boolean(validationErrors.contactPhone)}
                minLength={7}
                maxLength={40}
                name="contactPhone"
                onChange={() =>
                  setValidationErrors((current) => ({
                    ...current,
                    contactPhone: undefined,
                  }))
                }
                placeholder="Enter contact phone"
                type="tel"
              />
              {validationErrors.contactPhone && (
                <span
                  className="block text-xs text-destructive"
                  id="school-phone-error"
                  role="alert"
                >
                  {validationErrors.contactPhone}
                </span>
              )}
            </label>
          </div>

          <div className="flex gap-3 rounded-lg border bg-muted/30 p-3.5" role="note">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-5 text-muted-foreground">
              This adds a temporary demonstration record to this page session only. It does not
              create a database record or grant platform access.
            </p>
          </div>
          <Button className="w-full" type="submit">
            Add demonstration school
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
