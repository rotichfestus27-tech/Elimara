import { ArrowUpRight, Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { NavigationItem } from "@/config/navigation";

type PlaceholderPageProps = {
  item: NavigationItem;
};

export function PlaceholderPage({ item }: PlaceholderPageProps) {
  const Icon = item.icon;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-2">
        <Badge variant="secondary">Module placeholder</Badge>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-[30px]">{item.label}</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{item.description}</p>
      </div>

      <Card className="shadow-none">
        <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-10 text-center">
          <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
            <Icon aria-hidden="true" className="size-6" strokeWidth={1.7} />
          </div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Construction aria-hidden="true" className="size-4 text-muted-foreground" />
            This area is not built yet
          </div>
          <p className="max-w-md text-xs leading-5 text-muted-foreground">
            This page is part of the frontend foundation only. No records, workflows, or backend integrations are implemented.
          </p>
          <Badge className="mt-5 gap-1.5" variant="outline">
            <span>Placeholder</span>
            <ArrowUpRight aria-hidden="true" className="size-3" />
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}

