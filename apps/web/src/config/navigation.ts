import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileBarChart,
  GraduationCap,
  LayoutDashboard,
  Settings2,
  UserRoundPlus,
  UsersRound,
  WalletCards,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
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
    description: "Admissions workflows will be available here.",
    icon: UserRoundPlus,
  },
  {
    label: "Students",
    href: "/students",
    description: "Student records and related workflows will be available here.",
    icon: GraduationCap,
  },
  {
    label: "Academics",
    href: "/academics",
    description: "Academic setup and learning information will be available here.",
    icon: BookOpen,
  },
  {
    label: "Attendance",
    href: "/attendance",
    description: "Attendance tools will be available here.",
    icon: ClipboardCheck,
  },
  {
    label: "Examinations",
    href: "/examinations",
    description: "Examination workflows will be available here.",
    icon: FileBarChart,
  },
  {
    label: "Finance",
    href: "/finance",
    description: "Finance tools will be available here.",
    icon: WalletCards,
  },
  {
    label: "Staff",
    href: "/staff",
    description: "Staff workflows will be available here.",
    icon: UsersRound,
  },
  {
    label: "Timetable",
    href: "/timetable",
    description: "Timetable planning will be available here.",
    icon: CalendarDays,
  },
  {
    label: "Reports",
    href: "/reports",
    description: "School reports will be available here.",
    icon: Waypoints,
  },
  {
    label: "Settings",
    href: "/settings",
    description: "Workspace preferences will be available here.",
    icon: Settings2,
  },
];

