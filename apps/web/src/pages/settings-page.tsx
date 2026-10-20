import {
  Bell,
  Building2,
  CalendarCog,
  Info,
  Languages,
  LockKeyhole,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { FormField } from "@/components/students/form-field";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";

const inputClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

function FormActions() {
  return (
    <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
      <Button type="reset" variant="outline">
        Reset
      </Button>
      <Button disabled type="button">
        <Save aria-hidden="true" />
        Save Changes unavailable
      </Button>
    </div>
  );
}

function NotConnectedNote({ children }: { children: string }) {
  return (
    <div
      className="flex gap-3 rounded-lg border bg-muted/30 p-3.5"
      role="note"
    >
      <Info
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <p className="text-xs leading-5 text-muted-foreground">{children}</p>
    </div>
  );
}

function UnavailableSelect({
  id,
  label,
  placeholder,
}: {
  id: string;
  label: string;
  placeholder: string;
}) {
  return (
    <FormField id={id} label={label}>
      <select
        className={inputClassName}
        defaultValue=""
        id={id}
        name={id}
      >
        <option disabled value="">
          {placeholder}
        </option>
        <option disabled value="unavailable">
          Options unavailable
        </option>
      </select>
    </FormField>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <p className="text-sm font-medium text-primary">Workspace controls</p>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Settings &amp; Configuration
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          Configure school information, academic defaults, and workspace
          preferences.
        </p>
      </section>

      <div
        className="flex gap-3 rounded-lg border border-amber-300/70 bg-amber-50/70 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        role="note"
      >
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">
            Settings are not connected to a save service
          </p>
          <p className="mt-1 text-xs leading-5 opacity-85">
            You can review the available controls, but values cannot be saved
            or applied. No school or user details are prefilled.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <SettingsSection
          id="school-profile"
          title="School Profile"
          description="School identity and contact information."
          icon={<Building2 aria-hidden="true" className="size-[18px]" />}
        >
          <form
            className="space-y-5"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="school-name" label="School name">
                <input
                  className={inputClassName}
                  id="school-name"
                  name="schoolName"
                  placeholder="Not configured"
                />
              </FormField>
              <FormField id="school-code" label="School code">
                <input
                  className={inputClassName}
                  id="school-code"
                  name="schoolCode"
                  placeholder="Not configured"
                />
              </FormField>
              <FormField id="school-email" label="Email address">
                <input
                  autoComplete="email"
                  className={inputClassName}
                  id="school-email"
                  name="schoolEmail"
                  placeholder="Not configured"
                  type="email"
                />
              </FormField>
              <FormField id="school-phone" label="Phone number">
                <input
                  autoComplete="tel"
                  className={inputClassName}
                  id="school-phone"
                  name="schoolPhone"
                  placeholder="Not configured"
                  type="tel"
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField id="school-address" label="Physical address">
                  <textarea
                    className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    id="school-address"
                    name="schoolAddress"
                    placeholder="Not configured"
                  />
                </FormField>
              </div>
              <FormField id="school-website" label="Website">
                <input
                  autoComplete="url"
                  className={inputClassName}
                  id="school-website"
                  name="schoolWebsite"
                  placeholder="https://"
                  type="url"
                />
              </FormField>
            </div>
            <NotConnectedNote>
              School profile values are unavailable. Reset clears only this
              unsaved form; Save Changes is disabled until persistence is
              connected.
            </NotConnectedNote>
            <FormActions />
          </form>
        </SettingsSection>

        <SettingsSection
          id="academic-configuration"
          title="Academic Configuration"
          description="Set academic year, term, grading, and attendance defaults."
          icon={<CalendarCog aria-hidden="true" className="size-[18px]" />}
        >
          <form
            className="space-y-5"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <UnavailableSelect
                id="current-academic-year"
                label="Current academic year"
                placeholder="Select academic year"
              />
              <UnavailableSelect
                id="academic-term"
                label="Academic term"
                placeholder="Select academic term"
              />
              <UnavailableSelect
                id="default-grading-scale"
                label="Default grading scale"
                placeholder="Select grading scale"
              />
              <FormField
                id="attendance-threshold"
                label="Attendance threshold (%)"
              >
                <input
                  className={inputClassName}
                  id="attendance-threshold"
                  max="100"
                  min="0"
                  name="attendanceThreshold"
                  placeholder="Not configured"
                  type="number"
                />
              </FormField>
            </div>
            <NotConnectedNote>
              Academic configuration options are unavailable until the
              approved academic settings contract is connected.
            </NotConnectedNote>
            <FormActions />
          </form>
        </SettingsSection>

        <SettingsSection
          id="system-preferences"
          title="System Preferences"
          description="Choose workspace locale, date, time, and notification preferences."
          icon={<Languages aria-hidden="true" className="size-[18px]" />}
        >
          <form
            className="space-y-5"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <UnavailableSelect
                id="time-zone"
                label="Time zone"
                placeholder="Select time zone"
              />
              <UnavailableSelect
                id="date-format"
                label="Date format"
                placeholder="Select date format"
              />
              <UnavailableSelect
                id="default-language"
                label="Default language"
                placeholder="Select language"
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">
                Notification preferences
              </legend>
              <p className="text-xs leading-5 text-muted-foreground">
                Select preferred channels for this local preview. Preferences
                are not saved.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {["Email notifications", "SMS notifications", "In-app notifications"].map(
                  (label, index) => (
                    <label
                      key={label}
                      className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2.5 text-sm focus-within:ring-2 focus-within:ring-ring"
                    >
                      <input
                        className="size-4 accent-primary"
                        name="notificationPreferences"
                        type="checkbox"
                        value={["email", "sms", "in-app"][index]}
                      />
                      {label}
                    </label>
                  ),
                )}
              </div>
            </fieldset>

            <NotConnectedNote>
              Preference selections are temporary and will be discarded when
              this page is refreshed or reset.
            </NotConnectedNote>
            <FormActions />
          </form>
        </SettingsSection>

        <SettingsSection
          id="user-profile"
          title="User Profile"
          description="User profile information, when available."
          icon={<UserRound aria-hidden="true" className="size-[18px]" />}
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="profile-display-name" label="Display name">
                <input
                  className={inputClassName}
                  id="profile-display-name"
                  readOnly
                  value=""
                />
              </FormField>
              <FormField id="profile-email" label="Email address">
                <input
                  className={inputClassName}
                  id="profile-email"
                  readOnly
                  type="email"
                  value=""
                />
              </FormField>
              <FormField id="profile-role" label="Role">
                <input
                  className={`${inputClassName} text-muted-foreground`}
                  id="profile-role"
                  readOnly
                  value="—"
                />
              </FormField>
            </div>
            <NotConnectedNote>
              User profile information is unavailable. Profile edits and
              identity management are not connected.
            </NotConnectedNote>
          </div>
        </SettingsSection>

        <SettingsSection
          id="security-access"
          title="Security & Access"
          description="Account security and session information."
          icon={<ShieldCheck aria-hidden="true" className="size-[18px]" />}
        >
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <LockKeyhole
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  Password &amp; security
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Password status and security settings are unavailable.
                </p>
                <Button className="mt-4 w-full sm:w-auto" disabled variant="outline">
                  Security actions unavailable
                </Button>
              </div>
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Bell
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  Session &amp; access
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Current session</dt>
                    <dd className="font-medium">—</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Access details</dt>
                    <dd className="font-medium">—</dd>
                  </div>
                </dl>
                <Button className="mt-4 w-full sm:w-auto" disabled variant="outline">
                  Session controls unavailable
                </Button>
              </div>
            </div>
            <NotConnectedNote>
              Account security actions, session management, and access
              information are not connected. No credentials or security status
              are displayed.
            </NotConnectedNote>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
