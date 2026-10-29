import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/app/auth-provider";
import { ApiClientError } from "@/lib/api/client";

export function LoginPage() {
  const { login, error: sessionError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (loginError) {
      setError(loginErrorMessage(loginError));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to Elimara</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use your school account to open your authorized workspace.
          </p>
        </CardHeader>
        <CardContent>
          <form aria-busy={submitting} className="space-y-4" onSubmit={submit}>
            {(error || sessionError) && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error ?? sessionError}
              </p>
            )}
            <label className="block space-y-1.5 text-sm">
              <span>Email</span>
              <input
                autoComplete="email"
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                disabled={submitting}
                maxLength={320}
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span>Password</span>
              <input
                autoComplete="current-password"
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                disabled={submitting}
                maxLength={1024}
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <Button className="w-full" disabled={submitting} type="submit">
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function loginErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.code === "INVALID_CREDENTIALS") {
      return "Email or password is incorrect.";
    }
    if (error.status === 429) {
      return "Too many sign-in attempts. Wait a while before trying again.";
    }
    if (error.code === "NETWORK_ERROR") {
      return "The service could not be reached. Check your connection and try again.";
    }
  }

  return "We couldn't sign you in. Check your details and try again.";
}
