import { Info, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FormField } from "@/components/students/form-field";

const inputClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function AddStaffMemberSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>
          <UserRoundPlus aria-hidden="true" />
          Add Staff Member
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby="staff-form-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        <div className="space-y-1 pr-8">
          <SheetTitle>Add staff member</SheetTitle>
          <SheetDescription id="staff-form-description">
            Staff profile preview only. Staff records cannot yet be saved.
          </SheetDescription>
        </div>

        <form
          className="mt-7 space-y-6"
          onSubmit={(event) => event.preventDefault()}
        >
          <p className="text-xs text-muted-foreground">
            Fields marked with <span className="text-destructive">*</span> are
            required in a future connected workflow.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="staff-first-name" label="First name *">
              <input
                autoComplete="given-name"
                className={inputClassName}
                id="staff-first-name"
                name="firstName"
                placeholder="Enter first name"
                required
              />
            </FormField>
            <FormField id="staff-last-name" label="Last name *">
              <input
                autoComplete="family-name"
                className={inputClassName}
                id="staff-last-name"
                name="lastName"
                placeholder="Enter last name"
                required
              />
            </FormField>
            <FormField id="staff-id" label="Staff ID *">
              <input
                autoComplete="off"
                className={inputClassName}
                id="staff-id"
                name="staffId"
                placeholder="Enter staff ID"
                required
              />
            </FormField>
            <FormField id="staff-email" label="Email">
              <input
                autoComplete="email"
                className={inputClassName}
                id="staff-email"
                name="email"
                placeholder="name@example.com"
                type="email"
              />
            </FormField>
            <FormField id="staff-phone" label="Phone number">
              <input
                autoComplete="tel"
                className={inputClassName}
                id="staff-phone"
                name="phone"
                placeholder="Enter phone number"
                type="tel"
              />
            </FormField>
            <FormField id="staff-department" label="Department *">
              <input
                autoComplete="organization-title"
                className={inputClassName}
                id="staff-department"
                name="department"
                placeholder="Enter department"
                required
              />
            </FormField>
            <FormField id="staff-position" label="Position *">
              <input
                autoComplete="off"
                className={inputClassName}
                id="staff-position"
                name="position"
                placeholder="Enter position"
                required
              />
            </FormField>
            <FormField id="staff-category" label="Staff category *">
              <select
                className={inputClassName}
                defaultValue=""
                id="staff-category"
                name="category"
                required
              >
                <option disabled value="">
                  Select a category
                </option>
                <option value="teaching">Teaching</option>
                <option value="non-teaching">Non-Teaching</option>
              </select>
            </FormField>
            <FormField
              id="staff-employment-status"
              label="Employment status *"
            >
              <select
                className={inputClassName}
                defaultValue=""
                id="staff-employment-status"
                name="employmentStatus"
                required
              >
                <option disabled value="">
                  Select a status
                </option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on-leave">On leave</option>
                <option value="terminated">Terminated</option>
              </select>
            </FormField>
            <FormField id="staff-date-hired" label="Date hired *">
              <input
                className={inputClassName}
                id="staff-date-hired"
                name="dateHired"
                required
                type="date"
              />
            </FormField>
          </div>

          <div
            className="flex gap-3 rounded-lg border bg-muted/30 p-3.5"
            role="note"
          >
            <Info
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              This form does not save staff records or create user accounts,
              credentials, or permissions.
            </p>
          </div>
          <Button className="w-full" disabled type="submit" variant="secondary">
            Save unavailable in preview
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
