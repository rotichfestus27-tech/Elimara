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
