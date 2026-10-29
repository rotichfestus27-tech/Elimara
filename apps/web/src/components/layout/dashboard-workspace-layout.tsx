import { type ReactNode, useState } from "react";
import { Link, Outlet } from "react-router";
import { MobileNavigationDrawer } from "@/components/layout/workspace-navigation";

export function DashboardWorkspaceLayout({
  navigationLabel,
  workspaceLabel,
  workspaceHref,
  pageTitle,
  status,
  renderSidebar,
  children,
}: {
  navigationLabel: string;
  workspaceLabel: string;
  workspaceHref: string;
  pageTitle: string;
  status: ReactNode;
  renderSidebar(onNavigate?: () => void): ReactNode;
  children?: ReactNode;
}) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  return (
    <div className="min-h-screen min-w-0 bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] overflow-x-hidden overflow-y-auto border-r bg-card lg:block">
        {renderSidebar()}
      </aside>

      <div className="min-w-0 lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <MobileNavigationDrawer
              label={navigationLabel}
              onOpenChange={setMobileNavigationOpen}
              open={mobileNavigationOpen}
            >
              {renderSidebar(() => setMobileNavigationOpen(false))}
            </MobileNavigationDrawer>
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex min-w-0 items-center gap-2">
                <li className="hidden min-w-0 sm:block">
                  <Link
                    className="block max-w-48 truncate text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    to={workspaceHref}
                  >
                    {workspaceLabel}
                  </Link>
                </li>
                <li aria-hidden="true" className="hidden text-xs text-muted-foreground sm:block">
                  /
                </li>
                <li aria-current="page" className="min-w-0">
                  <h1 className="truncate text-sm font-semibold text-foreground">{pageTitle}</h1>
                </li>
              </ol>
            </nav>
          </div>
          <div className="ml-2 min-w-0 max-w-[42%] shrink-0 [&>*]:max-w-full">{status}</div>
        </header>
        <main className="mx-auto min-w-0 w-full max-w-[1440px] overflow-x-clip px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
