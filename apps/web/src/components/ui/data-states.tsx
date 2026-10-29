import { AlertCircle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LoadingStateProps = {
  message: string;
  className?: string;
};

export function LoadingState({ message, className }: LoadingStateProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground",
        className,
      )}
      role="status"
    >
      <Loader2 aria-hidden="true" className="size-5 animate-spin" />
      <span>{message}</span>
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center text-center", className)} role="status">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
  className?: string;
};

type UnauthorizedStateProps = {
  title?: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function UnauthorizedState({
  title = "Access unavailable",
  description,
  action,
  className,
}: UnauthorizedStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center text-center", className)}
      role="alert"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1.5 max-w-xl text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      {action}
    </div>
  );
}

export function ErrorState({
  message = "This information could not be loaded. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 text-center", className)} role="alert">
      <AlertCircle aria-hidden="true" className="size-5 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} size="sm" variant="outline">
          Retry
        </Button>
      )}
    </div>
  );
}
