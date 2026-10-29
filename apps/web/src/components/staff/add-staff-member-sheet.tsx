import { Info, UserRoundPlus } from "lucide-react";
import { FormField } from "@/components/students/form-field";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const inputClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function AddStaffMemberSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>
          <UserRoundPlus aria-hidden="true" />
          Staff form preview
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby="staff-form-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-1 pr-8">
          <SheetTitle>Staff profile form preview</SheetTitle>
          <SheetDescription id="staff-form-description">
            This preview follows the proposed staff profile fields. Nothing is saved while contract
            approval and integration are pending.
          </SheetDescription>
        </div>

        <form className="mt-7 space-y-6" onSubmit={(event) => event.preventDefault()}>
          <p className="text-xs text-muted-foreground">
            Required fields in the proposal are marked with{" "}
            <span className="text-destructive">*</span>.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="staff-number" label="Staff number *">
              <input
                autoComplete="off"
                className={inputClassName}
                id="staff-number"
                maxLength={80}
                name="staffNumber"
                placeholder="Enter staff number"
                required
              />
            </FormField>
            <FormField id="staff-given-name" label="Given name *">
              <input
                autoComplete="given-name"
                className={inputClassName}
                id="staff-given-name"
                maxLength={100}
                name="givenName"
                placeholder="Enter given name"
                required
              />
            </FormField>
            <FormField id="staff-middle-name" label="Middle name">
              <input
                autoComplete="off"
                className={inputClassName}
                id="staff-middle-name"
                maxLength={100}
                name="middleName"
                placeholder="Enter middle name"
              />
            </FormField>
            <FormField id="staff-family-name" label="Family name *">
              <input
                autoComplete="family-name"
                className={inputClassName}
                id="staff-family-name"
                maxLength={100}
                name="familyName"
                placeholder="Enter family name"
                required
              />
            </FormField>
            <FormField id="staff-position-title" label="Position title *">
              <input
                autoComplete="organization-title"
                className={inputClassName}
                id="staff-position-title"
                maxLength={120}
                name="positionTitle"
                placeholder="Enter position title"
                required
              />
            </FormField>
            <FormField id="staff-contact-email" label="Contact email">
              <input
                autoComplete="email"
                className={inputClassName}
                id="staff-contact-email"
                maxLength={320}
                name="contactEmail"
                placeholder="name@example.com"
                type="email"
              />
            </FormField>
            <FormField id="staff-contact-phone" label="Contact phone">
              <input
                autoComplete="tel"
                className={inputClassName}
                id="staff-contact-phone"
                maxLength={40}
                minLength={7}
                name="contactPhone"
                placeholder="Enter contact phone"
                type="tel"
              />
            </FormField>
          </div>

          <div className="flex gap-3 rounded-lg border bg-muted/30 p-3.5" role="note">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-5 text-muted-foreground">
              Staff profiles are separate from user accounts. This preview does not create a
              profile, account, credentials, or permissions.
            </p>
          </div>
          <Button className="w-full" disabled type="submit" variant="secondary">
            Saving unavailable pending contract approval
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
