import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { PlatformUserDemo } from "@/config/platform-user-demo-data";

type PlatformUserDetailsSheetProps = {
  user: PlatformUserDemo | null;
  onOpenChange: (open: boolean) => void;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function PlatformUserDetailsSheet({
  user,
  onOpenChange,
}: PlatformUserDetailsSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={Boolean(user)}>
      <SheetContent
        aria-describedby="platform-user-details-description"
        className="w-full overflow-y-auto sm:max-w-xl"
        side="right"
      >
        {user && (
          <>
            <div className="space-y-2 pr-8">
              <Badge variant="outline">Demonstration record</Badge>
              <SheetTitle className="text-xl">{user.name}</SheetTitle>
              <SheetDescription id="platform-user-details-description">
                Temporary preview details only. No platform account or
                permissions are associated with this entry.
              </SheetDescription>
            </div>

            <dl className="mt-8 divide-y rounded-lg border">
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">
                  Email
                </dt>
                <dd className="break-all text-sm">{user.email}</dd>
              </div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">
                  Demo role label
                </dt>
                <dd>
                  <Badge variant="secondary">{user.roleLabel}</Badge>
                </dd>
              </div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">
                  Demo status
                </dt>
                <dd>
                  <Badge variant="outline">{user.status}</Badge>
                </dd>
              </div>
              <div className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-muted-foreground">
                  Added (demo)
                </dt>
                <dd className="text-sm">{formatDate(user.createdAt)}</dd>
              </div>
            </dl>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
