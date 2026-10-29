import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link, Outlet } from "react-router";
import { RequestError, RequestLoading } from "@/components/api/request-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClientError, apiRequest } from "@/lib/api/client";
import type { PlatformMfaStatus } from "@/lib/api/platform-types";

type EnrollmentResponse = { secret: string; provisioningUri: string };

export function SuperadminAccessGate() {
  const access = useQuery({
    queryKey: ["platform-access"],
    queryFn: ({ signal }) =>
      apiRequest<{ data: { access: "platform" } }>("/platform/access", { signal }),
    retry: false,
  });
  const requiresMfa =
    access.error instanceof ApiClientError && access.error.code === "PLATFORM_MFA_REQUIRED";
  const mfa = useQuery({
    queryKey: ["platform-mfa-status"],
    queryFn: ({ signal }) =>
      apiRequest<{ data: PlatformMfaStatus }>("/platform/mfa/status", { signal }),
    enabled: requiresMfa,
    retry: false,
  });

  if (access.isPending) return <RequestLoading />;
  if (access.isSuccess) return <Outlet />;
  if (requiresMfa) {
    if (mfa.isPending) return <RequestLoading />;
    if (mfa.isError) {
      return (
        <AccessMessage
          description="Platform MFA status could not be verified. Try again or contact your platform operator."
          error={mfa.error}
          onRetry={() => void mfa.refetch()}
        />
      );
    }
    if (mfa.data.data.sessionVerified) {
      return (
        <AccessMessage
          description="The platform access check did not complete even though the current session reports a valid MFA step-up."
          error={access.error}
          onRetry={() => void access.refetch()}
        />
      );
    }
    return <MfaStepUp status={mfa.data.data} />;
  }

  return (
    <AccessMessage
      description="Access requires a server-verified platform administrator assignment. School membership does not grant platform access."
      error={access.error}
      onRetry={() => void access.refetch()}
    />
  );
}

function AccessMessage({
  description,
  error,
  onRetry,
}: {
  description: string;
  error: Error | null;
  onRetry?: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4 sm:p-6">
      <Card className="w-full max-w-lg shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <ShieldAlert aria-hidden="true" className="size-6" />
          </div>
          <Badge variant="outline">Platform access required</Badge>
          <CardTitle className="pt-3 text-xl">Platform access is unavailable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-center text-sm leading-6 text-muted-foreground">
          <p>{description}</p>
          {error && <RequestError error={error} />}
          <div className="flex flex-wrap justify-center gap-2">
            {onRetry && (
              <Button onClick={onRetry} variant="outline">
                Retry access check
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link to="/dashboard">Return to school workspace</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function MfaStepUp({ status }: { status: PlatformMfaStatus }) {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<EnrollmentResponse | null>(null);

  const startEnrollment = useMutation({
    mutationFn: (currentPassword: string) =>
      apiRequest<{ data: EnrollmentResponse }>("/platform/mfa/enrollment", {
        method: "POST",
        body: { password: currentPassword },
      }),
    onSuccess: (response) => {
      setEnrollment(response.data);
      setPassword("");
    },
  });
  const stepUp = useMutation({
    mutationFn: (mfaCode: string) =>
      apiRequest<void>("/platform/mfa/verify", {
        method: "POST",
        body: { code: mfaCode },
      }),
    onSuccess: async () => {
      setCode("");
      await refreshPlatformAccess(queryClient);
    },
  });
  const completeEnrollment = useMutation({
    mutationFn: (mfaCode: string) =>
      apiRequest<void>("/platform/mfa/enrollment/confirm", {
        method: "POST",
        body: { code: mfaCode },
      }),
    onSuccess: async () => {
      setCode("");
      setEnrollment(null);
      await refreshPlatformAccess(queryClient);
    },
  });
  const mutationError = startEnrollment.error ?? completeEnrollment.error ?? stepUp.error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4 sm:p-6">
      <Card className="w-full max-w-lg shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldAlert aria-hidden="true" className="size-6" />
          </div>
          <Badge variant="outline">Platform multi-factor authentication</Badge>
          <CardTitle className="pt-3 text-xl">
            {status.enrolled ? "Verify your authenticator" : "Set up your authenticator"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6">
          <p className="text-center text-muted-foreground">
            {status.enrolled
              ? "Enter the current six-digit code to step up this session. Verification expires after 12 hours."
              : "Platform access requires an authenticator. Enrollment uses the supported platform API and your current password."}
          </p>

          {!status.enrolled && !enrollment && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                startEnrollment.mutate(password);
              }}
            >
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Current password</span>
                <input
                  autoComplete="current-password"
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <Button className="w-full" disabled={startEnrollment.isPending} type="submit">
                {startEnrollment.isPending ? "Starting enrollment..." : "Begin enrollment"}
              </Button>
            </form>
          )}

          {!status.enrolled && enrollment && (
            <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <h2 className="font-medium">Add this account to your authenticator</h2>
              <p className="text-xs text-muted-foreground">
                The setup secret is displayed only in this page session. Enter it manually in an
                authenticator app; do not share or save it here.
              </p>
              <p className="break-all rounded bg-background p-3 font-mono text-xs">
                {enrollment.secret}
              </p>
              <a
                className="block break-all text-xs text-primary underline"
                href={enrollment.provisioningUri}
              >
                Open authenticator setup link
              </a>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  completeEnrollment.mutate(code);
                }}
              >
                <MfaCodeField code={code} onChange={setCode} />
                <Button className="w-full" disabled={completeEnrollment.isPending} type="submit">
                  {completeEnrollment.isPending ? "Verifying..." : "Confirm enrollment"}
                </Button>
              </form>
            </section>
          )}

          {status.enrolled && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                stepUp.mutate(code);
              }}
            >
              <MfaCodeField code={code} onChange={setCode} />
              <Button className="w-full" disabled={stepUp.isPending} type="submit">
                {stepUp.isPending ? "Verifying..." : "Verify and continue"}
              </Button>
            </form>
          )}
          {mutationError && <RequestError error={mutationError} />}
          <div className="text-center">
            <Button asChild size="sm" variant="ghost">
              <Link to="/dashboard">Return to school workspace</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function MfaCodeField({ code, onChange }: { code: string; onChange(value: string): void }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Six-digit authenticator code
      </span>
      <input
        autoComplete="one-time-code"
        className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono tracking-[0.3em]"
        inputMode="numeric"
        maxLength={6}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
        pattern="[0-9]{6}"
        required
        value={code}
      />
    </label>
  );
}

async function refreshPlatformAccess(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["platform-mfa-status"] });
  await queryClient.invalidateQueries({ queryKey: ["platform-access"] });
}
