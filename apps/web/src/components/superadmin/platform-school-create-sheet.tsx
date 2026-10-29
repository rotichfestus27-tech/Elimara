import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { RequestError } from "@/components/api/request-state";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type SchoolInput = {
  name: string;
  contactEmail?: string;
  contactPhone?: string;
};

type PlatformSchoolCreateSheetProps = {
  error: Error | null;
  isPending: boolean;
  onCreate(input: SchoolInput): Promise<void>;
};

const inputClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PlatformSchoolCreateSheet({
  error,
  isPending,
  onCreate,
}: PlatformSchoolCreateSheetProps) {
  const [open, setOpen] = useState(false);
  const [validationError, setValidationError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const contactEmail = String(formData.get("contactEmail") ?? "")
      .trim()
      .toLowerCase();
    const contactPhone = String(formData.get("contactPhone") ?? "").trim();

    if (!name || name.length > 200) {
      setValidationError("Enter a school name (up to 200 characters).");
      return;
    }
    if (
      contactEmail &&
      (contactEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    ) {
      setValidationError("Enter a valid contact email (up to 320 characters).");
      return;
    }
    if (contactPhone && (contactPhone.length < 7 || contactPhone.length > 40)) {
      setValidationError("Enter a contact phone with 7 to 40 characters.");
      return;
    }

    try {
      await onCreate({
        name,
        ...(contactEmail ? { contactEmail } : {}),
        ...(contactPhone ? { contactPhone } : {}),
      });
    } catch {
      return;
    }
    form.reset();
    setValidationError("");
    setOpen(false);
  }

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setValidationError("");
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
        aria-describedby="platform-school-create-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-2 pr-8">
          <SheetTitle>Add school</SheetTitle>
          <SheetDescription id="platform-school-create-description">
            Creates a suspended school tenant record only. It does not invite an owner, create a
            school user, or grant school access.
          </SheetDescription>
        </div>

        <form className="mt-7 space-y-5" noValidate onSubmit={(event) => void handleSubmit(event)}>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">School name</span>
            <input
              autoComplete="organization"
              className={inputClassName}
              maxLength={200}
              name="name"
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Contact email</span>
            <input
              autoComplete="email"
              className={inputClassName}
              maxLength={320}
              name="contactEmail"
              type="email"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium">Contact phone</span>
            <input
              autoComplete="tel"
              className={inputClassName}
              maxLength={40}
              name="contactPhone"
              type="tel"
            />
          </label>
          {validationError && (
            <p className="text-sm text-destructive" role="alert">
              {validationError}
            </p>
          )}
          <RequestError error={error} />
          <Button className="w-full" disabled={isPending} type="submit">
            {isPending ? "Creating school..." : "Create suspended school"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
