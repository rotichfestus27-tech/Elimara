import {
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  type LucideIcon,
  Settings2,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
} from "lucide-react";

export type SuperadminNavigationItem = {
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
};

export const superadminNavigationItems: SuperadminNavigationItem[] = [
  {
    label: "Overview",
    href: "/superadmin",
    description: "Platform-wide overview and recent activity.",
    icon: LayoutDashboard,
  },
  {
    label: "Schools",
    href: "/superadmin/schools",
    description: "School tenant management.",
    icon: Building2,
  },
  {
    label: "Plans & subscriptions",
    href: "/superadmin/subscriptions",
    description: "Platform plan catalog and school assignment history.",
    icon: CreditCard,
  },
  {
    label: "School Administrators",
    href: "/superadmin/school-administrators",
    description:
      "Not implemented: the platform API does not provide a school-administrator directory or invitation workflow.",
    icon: UserRoundCog,
  },
  {
    label: "Platform Users Preview",
    href: "/superadmin/platform-users",
    description:
      "Preview only; account listing and invitation operations are unavailable because the platform API does not provide them.",
    icon: UsersRound,
  },
  {
    label: "Analytics",
    href: "/superadmin/analytics",
    description: "Not implemented: no platform analytics endpoint is available.",
    icon: ChartNoAxesCombined,
  },
  {
    label: "Audit Logs",
    href: "/superadmin/audit-logs",
    description: "Platform audit events.",
    icon: ClipboardList,
  },
  {
    label: "Security",
    href: "/superadmin/security",
    description: "Platform security settings.",
    icon: ShieldCheck,
  },
  {
    label: "Platform Settings",
    href: "/superadmin/settings",
    description:
      "Configuration is unavailable; view the supported security status and documented operator boundaries.",
    icon: Settings2,
  },
];

export const superadminOverviewNavigationItem = superadminNavigationItems[0];

export const superadminPlaceholderNavigationItems = superadminNavigationItems.slice(1);
