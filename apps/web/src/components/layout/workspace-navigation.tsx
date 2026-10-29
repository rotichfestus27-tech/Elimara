import type { LucideIcon } from "lucide-react";
import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type WorkspaceNavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export function WorkspaceNavigationLinks({
  items,
  ariaLabel,
  onNavigate,
}: {
  items: WorkspaceNavigationItem[];
  ariaLabel: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label={ariaLabel} className="space-y-1 px-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.href}
            to={item.href}
            end={
              item.href === "/dashboard" || item.href === "/superadmin" || item.href === "/platform"
            }
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group relative flex min-h-10 min-w-0 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
                  />
                )}
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-[17px] shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                  strokeWidth={1.8}
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function MobileNavigationDrawer({
  open,
  onOpenChange,
  label,
  children,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button aria-label={`Open ${label}`} className="lg:hidden" size="icon" variant="outline">
          <Menu aria-hidden="true" className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-[min(280px,calc(100vw-1rem))] overflow-x-hidden overflow-y-auto p-0 sm:max-w-[280px]"
        side="left"
      >
        <SheetTitle className="sr-only">{label}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
