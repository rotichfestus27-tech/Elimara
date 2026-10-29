import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui/data-states";
import { apiRequest } from "@/lib/api/client";
import type { PlatformMfaStatus } from "@/lib/api/platform-types";

export function PlatformSecurityPage() {
  const status = useQuery({
    queryKey: ["platform-mfa-status"],
    queryFn: ({ signal }) =>
      apiRequest<{ data: PlatformMfaStatus }>("/platform/mfa/status", { signal }),
    retry: false,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      <PageHeader
        description="Platform access requires an out-of-band platform assignment and session-bound TOTP step-up. Enrollment and verification are handled through the protected access flow."
        eyebrow={<Badge variant="secondary">Platform security</Badge>}
        title="Multi-factor authentication"
      />

      <nav aria-label="Security sections" className="border-b">
        <ul className="flex flex-wrap gap-2 pb-3">
          <li>
            <a
              className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href="#security-status"
            >
              Current status
            </a>
          </li>
          <li>
            <a
              className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href="#access-boundary"
            >
              Access boundary
            </a>
          </li>
          <li>
            <a
              className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              href="#operator-procedures"
            >
              Operator procedures
            </a>
          </li>
        </ul>
      </nav>

      <Card className="scroll-mt-20 shadow-none" id="security-status">
        <CardHeader>
          <CardTitle aria-level={3} className="flex items-center gap-2 text-base" role="heading">
            <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
            Current factor and session
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.isPending ? (
            <LoadingState className="min-h-32" message="Checking platform MFA status..." />
          ) : status.isError ? (
            <ErrorState onRetry={() => void status.refetch()} />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <dt className="text-xs font-medium text-muted-foreground">
                  Authenticator enrollment
                </dt>
                <dd className="mt-2">
                  <Badge variant={status.data.data.enrolled ? "secondary" : "outline"}>
                    {status.data.data.enrolled ? "Enrolled" : "Not enrolled"}
                  </Badge>
                </dd>
              </div>
              <div className="rounded-lg border p-4">
                <dt className="text-xs font-medium text-muted-foreground">
                  Current session step-up
                </dt>
                <dd className="mt-2">
                  <Badge variant={status.data.data.sessionVerified ? "secondary" : "outline"}>
                    {status.data.data.sessionVerified ? "Verified" : "Verification required"}
                  </Badge>
                </dd>
              </div>
            </dl>
          )}
          <p
            className="scroll-mt-20 rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground"
            id="access-boundary"
          >
            Status is read from the protected platform MFA status endpoint. It describes the current
            factor and session only; it does not verify broader security posture or guarantee
            controls outside this endpoint.
          </p>
          <p
            className="scroll-mt-20 rounded-lg border border-dashed p-4 text-xs leading-5 text-muted-foreground"
            id="operator-procedures"
          >
            Factor reset, platform-admin assignment changes, and account recovery are out-of-band
            operator procedures. This status page does not modify MFA enrollment or platform
            privileges, and does not display secrets, tokens, or credentials.
          </p>
          <Button
            disabled={status.isFetching}
            onClick={() => void status.refetch()}
            size="sm"
            variant="outline"
          >
            {status.isFetching ? "Refreshing status..." : "Refresh status"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
