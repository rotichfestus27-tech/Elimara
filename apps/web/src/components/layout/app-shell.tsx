import { CheckCircle2, GraduationCap, LogOut, User } from "lucide-react";
import { useRef, useState } from "react";
import { useLocation } from "react-router";
import { useAuth } from "@/app/auth-provider";
import { DashboardWorkspaceLayout } from "@/components/layout/dashboard-workspace-layout";
import { WorkspaceNavigationLinks } from "@/components/layout/workspace-navigation";
import { Button } from "@/components/ui/button";
import { getVisibleSchoolNavigationItems } from "@/config/navigation";

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

type SidebarContentProps = {
  onNavigate?: () => void;
};

function SidebarContent({
  onNavigate,
  items,
}: SidebarContentProps & {
  items: ReturnType<typeof getVisibleSchoolNavigationItems>;
}) {
  const { school, user, logout, schools, selectSchool } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const logoutPendingRef = useRef(false);

  async function handleLogout() {
    if (logoutPendingRef.current) return;
    logoutPendingRef.current = true;
    setLogoutPending(true);
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError("Sign out could not be confirmed. Please try again.");
    } finally {
      logoutPendingRef.current = false;
      setLogoutPending(false);
    }
  }

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
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {school ? "School context loaded" : "No active school context"}
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
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="mb-2 px-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Menu
      </p>
      <WorkspaceNavigationLinks ariaLabel="Main navigation" items={items} onNavigate={onNavigate} />
      <div className="mt-auto border-t px-4 py-4">
        <div className="space-y-3 rounded-xl border bg-card p-3 shadow-xs">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                {user?.email ?? "Signed-in account"}
              </p>
              <p className="text-[10px] text-muted-foreground">Signed-in user</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={logoutPending}
            onClick={() => void handleLogout()}
            className="h-8 w-full text-xs text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut aria-hidden="true" className="mr-1.5 size-3.5" />
            {logoutPending ? "Signing out..." : "Sign Out"}
          </Button>
          {logoutError && (
            <p role="alert" className="text-xs text-destructive">
              {logoutError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const { school } = useAuth();
  const navigation = getVisibleSchoolNavigationItems(school);
  const location = useLocation();
  const currentPath = location.pathname.replace(/\/+$/, "") || "/";
  const activeItem =
    navigation.find(
      (item) => currentPath === item.href || currentPath.startsWith(`${item.href}/`),
    ) ?? navigation[0];

  return (
    <DashboardWorkspaceLayout
      navigationLabel="navigation"
      pageTitle={activeItem.label}
      workspaceHref="/dashboard"
      renderSidebar={(onNavigate) => <SidebarContent items={navigation} onNavigate={onNavigate} />}
      status={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 aria-hidden="true" className="size-3" />
          Signed in
        </span>
      }
      workspaceLabel={school?.name ?? "School workspace"}
    />
  );
}
