import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardPage } from "@/pages/dashboard-page";
import { AdmissionsPage } from "@/pages/admissions-page";
import { StudentsPage } from "@/pages/students-page";
import { AcademicsPage } from "@/pages/academics-page";
import { AttendancePage } from "@/pages/attendance-page";
import { ExaminationsPage } from "@/pages/examinations-page";
import { FinancePage } from "@/pages/finance-page";
import { StaffPage } from "@/pages/staff-page";
import { TimetablePage } from "@/pages/timetable-page";
import { ReportsPage } from "@/pages/reports-page";
import { SettingsPage } from "@/pages/settings-page";
import { PlaceholderPage } from "@/pages/placeholder-page";
import { navigationItems } from "@/config/navigation";
import { useAuth } from "@/app/auth-provider";
import { LoginPage } from "@/pages/login-page";
import { Button } from "@/components/ui/button";

function WorkspaceSelection() {
  const { schools, selectSchool, user } = useAuth();
  if (schools.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">No active school access</h1>
        <p className="text-sm text-muted-foreground">
          {user?.email} is signed in, but no active school membership is available.
          Ask your school administrator to grant access.
        </p>
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

const pageRoutes = [
  { href: "/dashboard", element: <DashboardPage /> },
  { href: "/admissions", element: <AdmissionsPage /> },
  { href: "/students", element: <StudentsPage /> },
  { href: "/academics", element: <AcademicsPage /> },
  { href: "/attendance", element: <AttendancePage /> },
  { href: "/examinations", element: <ExaminationsPage /> },
  { href: "/finance", element: <FinancePage /> },
  { href: "/staff", element: <StaffPage /> },
  { href: "/timetable", element: <TimetablePage /> },
  { href: "/reports", element: <ReportsPage /> },
  { href: "/settings", element: <SettingsPage /> },
];

export function AppRouter() {
  const { user, school, loading } = useAuth();
  if (loading) {
    return <main className="p-8 text-sm text-muted-foreground">Checking your session...</main>;
  }
  if (!user) return <LoginPage />;
  if (!school) return <WorkspaceSelection />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        {pageRoutes.map(({ href, element }) => (
          <Route key={href} path={href} element={element} />
        ))}
        {navigationItems
          .filter(
            (item) =>
              !pageRoutes.some((route) => route.href === item.href),
          )
          .map((item) => (
            <Route
              key={item.href}
              path={item.href}
              element={<PlaceholderPage item={item} />}
            />
          ))}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
