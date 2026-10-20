import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SettingsSectionProps = {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
};

export function SettingsSection({
  id,
  title,
  description,
  icon,
  children,
}: SettingsSectionProps) {
  return (
    <section aria-labelledby={`${id}-heading`} className="scroll-mt-24">
      <Card className="shadow-none">
        <CardHeader className="flex-row items-start gap-3 space-y-0 p-4 sm:p-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            {icon}
          </span>
          <div className="min-w-0">
            <CardTitle id={`${id}-heading`} className="text-base">
              {title}
            </CardTitle>
            <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-5 sm:px-6 sm:pb-6">
          {children}
        </CardContent>
      </Card>
    </section>
  );
}
