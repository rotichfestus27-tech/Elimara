import { useState } from "react";
import { GraduationCap, Menu } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router";
import { navigationItems } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-provider";

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <GraduationCap aria-hidden="true" className="size-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold tracking-tight text-foreground">
          Elimara
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          School management
        </span>
      </span>
    </div>
  );
}

type NavigationLinksProps = {
  onNavigate?: () => void;
};

function NavigationLinks({ onNavigate }: NavigationLinksProps) {
  return (
    <nav aria-label="Main navigation" className="space-y-1 px-3">
      {navigationItems.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === "/dashboard"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                  strokeWidth={1.8}
                />
                <span className="flex-1">{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

type SidebarContentProps = {
  onNavigate?: () => void;
};

function SidebarContent({ onNavigate }: SidebarContentProps) {
  const { school, user, logout, schools, selectSchool } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  return (
    <div className="flex h-full flex-col">
      <Brand />
      <div className="mx-4 mb-5 rounded-xl border bg-muted/40 px-3.5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Workspace
        </p>
        <p className="mt-1.5 truncate text-sm font-semibold text-foreground">
          {school?.name ?? "School workspace"}
        </p>
        {schools.length > 1 && (
          <label className="mt-2 block">
            <span className="sr-only">Select school</span>
            <select
              aria-label="Select school"
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              onChange={(event) => selectSchool(event.target.value)}
              value={school?.id}
            >
              {schools.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="mb-2 px-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Menu
      </p>
      <NavigationLinks onNavigate={onNavigate} />
      <div className="mt-auto px-4 py-4">
        <div className="rounded-xl border border-dashed bg-muted/30 px-3.5 py-3">
          <p className="truncate text-xs font-semibold text-foreground">{user?.email}</p>
          <button
            className="mt-2 text-xs text-primary underline"
            onClick={() => void logout().catch((error: unknown) =>
              setLogoutError(error instanceof Error ? error.message : "Sign out failed."),
            )}
            type="button"
          >
            Sign out
          </button>
          {logoutError && <p role="alert" className="mt-2 text-xs text-destructive">{logoutError}</p>}
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const { school } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const currentPath = location.pathname.replace(/\/+$/, "") || "/";
  const activeItem =
    navigationItems.find(
      (item) =>
        currentPath === item.href ||
        currentPath.startsWith(`${item.href}/`),
    ) ?? navigationItems[0];

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] overflow-y-auto border-r bg-card lg:block">
        <SidebarContent />
      </aside>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  aria-label="Open navigation"
                  className="lg:hidden"
                  size="icon"
                  variant="outline"
                >
                  <Menu aria-hidden="true" className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent
                className="w-[280px] overflow-y-auto p-0 sm:max-w-[280px]"
                side="left"
              >
                <SheetTitle className="sr-only">Main navigation</SheetTitle>
                <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <p className="hidden max-w-48 truncate text-[11px] font-medium text-muted-foreground sm:block">
                {school?.name ?? "School workspace"}
              </p>
              <h1 className="truncate text-sm font-semibold text-foreground">
                {activeItem.label}
              </h1>
            </div>
          </div>
          <span className="rounded-full border bg-card px-2.5 py-1 text-[10px] font-semibold text-muted-foreground sm:px-3 sm:text-[11px]">
            Authenticated
          </span>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
