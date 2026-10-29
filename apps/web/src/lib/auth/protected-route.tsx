import { Loader2 } from "lucide-react";
import { Navigate, Outlet } from "react-router";
import { useAuth } from "@/app/auth-provider";
import { Button } from "@/components/ui/button";

export function ProtectedRoute() {
  const { user, loading, error, refreshAuth } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 aria-hidden="true" className="size-8 animate-spin text-primary" />
          <p className="text-xs font-medium text-muted-foreground">Verifying workspace access...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="max-w-md text-sm text-destructive" role="alert">
          {error}
        </p>
        <Button onClick={() => void refreshAuth()} variant="outline">
          Retry session verification
        </Button>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { loading, user } = useAuth();

  if (loading) {
    return null;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
