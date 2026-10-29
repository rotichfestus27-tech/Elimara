import { type ComponentType, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { useAuth } from "@/app/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { SuperadminShell } from "@/components/layout/superadmin-shell";
import { SuperadminAccessGate } from "@/components/superadmin/superadmin-access-gate";
import { Button } from "@/components/ui/button";
import { UnauthorizedState } from "@/components/ui/data-states";
import { getVisibleSchoolNavigationItems } from "@/config/navigation";
import {
  superadminNavigationItems,
  superadminOverviewNavigationItem,
} from "@/config/superadmin-navigation";
import { ProtectedRoute, PublicOnlyRoute } from "@/lib/auth/protected-route";
import { PlaceholderPage } from "@/pages/placeholder-page";

const AcademicsPage = lazy(() =>
  import("@/pages/academics-page").then((module) => ({ default: module.AcademicsPage })),
);
const AdmissionsPage = lazy(() =>
  import("@/pages/admissions-page").then((module) => ({ default: module.AdmissionsPage })),
);
const AttendancePage = lazy(() =>
  import("@/pages/attendance-page").then((module) => ({ default: module.AttendancePage })),
);
const DashboardPage = lazy(() =>
  import("@/pages/dashboard-page").then((module) => ({ default: module.DashboardPage })),
);
const ExaminationsPage = lazy(() =>
  import("@/pages/examinations-page").then((module) => ({ default: module.ExaminationsPage })),
);
const FinancePage = lazy(() =>
  import("@/pages/finance-page").then((module) => ({ default: module.FinancePage })),
);
const LibraryPage = lazy(() =>
  import("@/pages/library-page").then((module) => ({ default: module.LibraryPage })),
);
const LoginPage = lazy(() =>
  import("@/pages/login-page").then((module) => ({ default: module.LoginPage })),
);
const ReportsPage = lazy(() =>
  import("@/pages/reports-page").then((module) => ({ default: module.ReportsPage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })),
);
const StaffPage = lazy(() =>
  import("@/pages/staff-page").then((module) => ({ default: module.StaffPage })),
);
const StudentsPage = lazy(() =>
  import("@/pages/students-page").then((module) => ({ default: module.StudentsPage })),
);
const TimetablePage = lazy(() =>
  import("@/pages/timetable-page").then((module) => ({ default: module.TimetablePage })),
);
const PlatformAnalyticsPage = lazy(() =>
  import("@/pages/superadmin/platform-analytics-page").then((module) => ({
    default: module.PlatformAnalyticsPage,
  })),
);
const PlatformAuditPage = lazy(() =>
  import("@/pages/superadmin/platform-audit-page").then((module) => ({
    default: module.PlatformAuditPage,
  })),
);
const PlatformPlansPage = lazy(() =>
  import("@/pages/superadmin/platform-plans-page").then((module) => ({
    default: module.PlatformPlansPage,
  })),
);
const PlatformSchoolDetailsPage = lazy(() =>
  import("@/pages/superadmin/platform-school-details-page").then((module) => ({
    default: module.PlatformSchoolDetailsPage,
  })),
);
const PlatformSecurityPage = lazy(() =>
  import("@/pages/superadmin/platform-security-page").then((module) => ({
    default: module.PlatformSecurityPage,
  })),
);
const PlatformSettingsPage = lazy(() =>
  import("@/pages/superadmin/platform-settings-page").then((module) => ({
    default: module.PlatformSettingsPage,
  })),
);
const PlatformUsersPage = lazy(() =>
  import("@/pages/superadmin/platform-users-page").then((module) => ({
    default: module.PlatformUsersPage,
  })),
);
const SuperadminOverviewPage = lazy(() =>
  import("@/pages/superadmin/superadmin-overview-page").then((module) => ({
    default: module.SuperadminOverviewPage,
  })),
);
const SuperadminSchoolsPage = lazy(() =>
  import("@/pages/superadmin/superadmin-schools-page").then((module) => ({
    default: module.SuperadminSchoolsPage,
  })),
);

function LazyRoute({ component: Page }: { component: ComponentType }) {
  return (
    <Suspense
      fallback={
        <div
          aria-busy="true"
          aria-live="polite"
          className="flex min-h-48 items-center justify-center p-8 text-sm text-muted-foreground"
          role="status"
        >
          Loading page...
        </div>
      }
    >
      <Page />
    </Suspense>
  );
}

const pageRoutes = [
  { href: "/dashboard", component: DashboardPage },
  { href: "/admissions", component: AdmissionsPage },
  { href: "/students", component: StudentsPage },
  { href: "/academics", component: AcademicsPage },
  { href: "/attendance", component: AttendancePage },
  { href: "/examinations", component: ExaminationsPage },
  { href: "/finance", component: FinancePage },
  { href: "/library", component: LibraryPage },
  { href: "/staff", component: StaffPage },
  { href: "/timetable", component: TimetablePage },
  { href: "/reports", component: ReportsPage },
  { href: "/settings", component: SettingsPage },
];

function WorkspaceSelection() {
  const { schools, selectSchool, user } = useAuth();

  if (schools.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
        <UnauthorizedState
          description={`${user?.email ?? "This account"} is signed in, but the server returned no active school memberships. Ask your school administrator to grant access.`}
          title="No active school access"
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Choose a school</h1>
      {schools.map((school) => (
        <Button
          className="h-auto justify-start py-4"
          key={school.id}
          onClick={() => selectSchool(school.id)}
          variant="outline"
        >
          {school.name}
        </Button>
      ))}
    </main>
  );
}

export function AppRouter() {
  const { user, school, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return <main className="p-8 text-sm text-muted-foreground">Checking your session...</main>;
  }
  if (!user && pathname !== "/login") return <Navigate to="/login" replace />;
  if (user && !school && !pathname.startsWith("/superadmin") && pathname !== "/platform") {
    return <WorkspaceSelection />;
  }

  return (
    <Routes>
      <Route path="/platform" element={<Navigate to="/superadmin" replace />} />
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LazyRoute component={LoginPage} />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/superadmin" element={<SuperadminAccessGate />}>
          <Route element={<SuperadminShell />}>
            <Route index element={<LazyRoute component={SuperadminOverviewPage} />} />
            {superadminNavigationItems
              .filter((item) => item.href !== superadminOverviewNavigationItem.href)
              .map((item) => (
                <Route
                  key={item.href}
                  path={item.href.slice("/superadmin/".length)}
                  element={
                    item.href === "/superadmin/schools" ? (
                      <LazyRoute component={SuperadminSchoolsPage} />
                    ) : item.href === "/superadmin/platform-users" ? (
                      <LazyRoute component={PlatformUsersPage} />
                    ) : item.href === "/superadmin/subscriptions" ? (
                      <LazyRoute component={PlatformPlansPage} />
                    ) : item.href === "/superadmin/audit-logs" ? (
                      <LazyRoute component={PlatformAuditPage} />
                    ) : item.href === "/superadmin/security" ? (
                      <LazyRoute component={PlatformSecurityPage} />
                    ) : item.href === "/superadmin/analytics" ? (
                      <LazyRoute component={PlatformAnalyticsPage} />
                    ) : item.href === "/superadmin/settings" ? (
                      <LazyRoute component={PlatformSettingsPage} />
                    ) : (
                      <PlaceholderPage item={item} />
                    )
                  }
                />
              ))}
            <Route
              path="schools/:schoolId"
              element={<LazyRoute component={PlatformSchoolDetailsPage} />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/superadmin" replace />} />
        </Route>

        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          {pageRoutes.map(({ href, component }) => (
            <Route key={href} path={href} element={<LazyRoute component={component} />} />
          ))}
          {getVisibleSchoolNavigationItems(school)
            .filter((item) => !pageRoutes.some((route) => route.href === item.href))
            .map((item) => (
              <Route key={item.href} path={item.href} element={<PlaceholderPage item={item} />} />
            ))}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
