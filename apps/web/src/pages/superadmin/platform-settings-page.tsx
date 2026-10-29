import { Link } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const sections = [
  { href: "#configuration", label: "Configuration" },
  { href: "#security", label: "Security" },
  { href: "#operations", label: "Operations" },
];

export function PlatformSettingsPage() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        description="Platform configuration is not available in the current platform API. This page does not display secret values or provide controls that are not backed by an approved contract."
        eyebrow={<Badge variant="outline">Configuration unavailable</Badge>}
        title="Platform settings"
      />

      <nav aria-label="Platform settings sections" className="border-b">
        <ul className="flex flex-wrap gap-2 pb-3">
          {sections.map((section) => (
            <li key={section.href}>
              <a
                className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                href={section.href}
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="configuration-heading" className="scroll-mt-20" id="configuration">
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold" id="configuration-heading">
              Platform configuration
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              No approved platform settings fields or read/update endpoints are defined by the
              current contract.
            </p>
          </CardHeader>
          <CardContent>
            <p className="rounded-lg border border-dashed p-4 text-sm leading-6 text-muted-foreground">
              Configuration values and editing controls are unavailable. No settings have been
              loaded, changed, or saved.
            </p>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="settings-security-heading" className="scroll-mt-20" id="security">
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold" id="settings-security-heading">
              Security status
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              The platform API exposes the current MFA enrollment and session verification status
              separately from platform configuration.
            </p>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/superadmin/security">View platform security status</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section
        aria-labelledby="settings-operations-heading"
        className="scroll-mt-20"
        id="operations"
      >
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold" id="settings-operations-heading">
              Restricted operator procedures
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              Platform-admin assignments, factor reset, and account recovery are handled out of band
              by operators. This page does not offer actions for those procedures.
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-xs leading-5 text-muted-foreground">
              No secrets, tokens, credentials, or internal configuration values are displayed. No
              administrative action is available from this page.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
