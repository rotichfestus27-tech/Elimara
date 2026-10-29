import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileBarChart,
  GraduationCap,
  LayoutDashboard,
  type LucideIcon,
  Settings2,
  UserRoundPlus,
  UsersRound,
  WalletCards,
  Waypoints,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
  requiredPermissions?: readonly string[];
  requiredPermissionSets?: readonly (readonly string[])[];
};

export const navigationItems: NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    description: "A starting point for your school workspace.",
    icon: LayoutDashboard,
  },
  {
    label: "Admissions",
    href: "/admissions",
    description: "Review and manage school admission applications.",
    icon: UserRoundPlus,
    requiredPermissions: ["admissions.application.read"],
  },
  {
    label: "Students",
    href: "/students",
    description: "View student profiles and linked guardian records.",
    icon: GraduationCap,
    requiredPermissions: ["students.profile.read"],
  },
  {
    label: "Academics",
    href: "/academics",
    description: "Manage academic years, terms, classes, streams, and subjects.",
    icon: BookOpen,
    requiredPermissions: ["academics.configuration.read"],
  },
  {
    label: "Attendance",
    href: "/attendance",
    description: "Manage school attendance registers and records.",
    icon: ClipboardCheck,
    requiredPermissions: ["attendance.register.read"],
  },
  {
    label: "Examinations",
    href: "/examinations",
    description: "Manage assessments and review student results.",
    icon: FileBarChart,
    requiredPermissions: ["assessments.read"],
  },
  {
    label: "Finance",
    href: "/finance",
    description: "Manage fee structures, accounts, and payment workflows.",
    icon: WalletCards,
    requiredPermissions: [
      "finance.accounts.read",
      "finance.fees.read",
      "finance.fees.manage",
      "finance.reports.read",
      "finance.payments.read",
      "finance.payments.record",
      "finance.adjustments.manage",
      "finance.refunds.manage",
      "finance.payments.reconcile",
    ],
  },
  {
    label: "Library",
    href: "/library",
    description: "Library catalog and circulation overview.",
    icon: BookOpen,
    requiredPermissions: [
      "library.catalog.read",
      "library.catalog.manage",
      "library.loans.read",
      "library.loans.manage",
      "library.reports.read",
    ],
  },
  {
    label: "Staff",
    href: "/staff",
    description: "Manage staff profiles, departments, employment, and assignments.",
    icon: UsersRound,
    requiredPermissions: ["staff.profile.read"],
  },
  {
    label: "Timetable",
    href: "/timetable",
    description: "View and manage the school's timetable.",
    icon: CalendarDays,
    requiredPermissions: ["timetable.read"],
  },
  {
    label: "Reports",
    href: "/reports",
    description: "Review school reports available to your permissions.",
    icon: Waypoints,
    requiredPermissionSets: [
      ["reports.exports.generate", "reports.students.read", "students.profile.read"],
      ["reports.exports.generate", "reports.attendance.read", "attendance.register.read"],
      [
        "reports.exports.generate",
        "reports.academics.read",
        "assessments.read",
        "academics.configuration.read",
      ],
      ["reports.exports.generate", "reports.finance.read", "finance.reports.read"],
      ["reports.exports.generate", "reports.staff.read", "staff.profile.read"],
    ],
  },
  {
    label: "Settings",
    href: "/settings",
    description: "View or update the school profile and contact details.",
    icon: Settings2,
    requiredPermissions: ["school.profile.read"],
  },
];

export type SchoolNavigationAccess =
  | {
      permissions: readonly string[];
    }
  | null
  | undefined;

export function getVisibleSchoolNavigationItems(access: SchoolNavigationAccess) {
  const granted = new Set(access?.permissions ?? []);
  return navigationItems.filter(
    (item) =>
      item.href === "/dashboard" ||
      (!item.requiredPermissions && !item.requiredPermissionSets) ||
      Boolean(item.requiredPermissions?.some((permission) => granted.has(permission))) ||
      Boolean(
        item.requiredPermissionSets?.some((permissions) =>
          permissions.every((permission) => granted.has(permission)),
        ),
      ),
  );
}
