import { ApiClientError } from "@/lib/api/client";

export function RequestError({ error }: { error: Error | null }) {
  if (!error) return null;
  const message =
    error instanceof ApiClientError ? error.message : "The data could not be loaded. Try again.";
  return (
    <p
      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
      role="alert"
    >
      {message}
    </p>
  );
}

export function RequestLoading() {
  return <p className="p-6 text-center text-sm text-muted-foreground">Loading records...</p>;
}
