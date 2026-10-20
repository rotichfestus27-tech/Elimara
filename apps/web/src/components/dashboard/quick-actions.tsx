import {
  ArrowUpRight,
  ClipboardCheck,
  GraduationCap,
  UserRoundPlus,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const actions = [
  {
    label: "Students",
    description: "Open student records",
    href: "/students",
    icon: GraduationCap,
  },
  {
    label: "Admissions",
    description: "Review applications",
    href: "/admissions",
    icon: UserRoundPlus,
  },
  {
    label: "Attendance",
    description: "Review attendance",
    href: "/attendance",
    icon: ClipboardCheck,
  },
  {
    label: "Fee collection",
    description: "Open finance management",
    href: "/finance",
    icon: WalletCards,
  },
];

export function QuickActions() {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Quick actions</CardTitle>
        <p className="text-sm text-muted-foreground">
          Shortcuts to the school workspace modules.
        </p>
      </CardHeader>
      <CardContent className="space-y-1">
        {actions.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.href}
              className="group flex min-h-14 items-center gap-3 rounded-lg px-2.5 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              to={action.href}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors group-hover:text-primary">
                <Icon
                  aria-hidden="true"
                  className="size-[17px]"
                  strokeWidth={1.8}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{action.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {action.description}
                </span>
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
