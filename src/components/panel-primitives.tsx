import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, statusToken, PRIORITY_LABELS } from "@/lib/turkish";
import type { ReactNode } from "react";

const STATUS_STYLE: Record<string, string> = {
  yeni: "bg-status-yeni/15 text-status-yeni border-status-yeni/30",
  devam: "bg-status-devam/15 text-status-devam border-status-devam/30",
  beklemede: "bg-status-beklemede/15 text-status-beklemede border-status-beklemede/30",
  cozuldu: "bg-status-cozuldu/15 text-status-cozuldu border-status-cozuldu/30",
  reddedildi: "bg-status-reddedildi/15 text-status-reddedildi border-status-reddedildi/30",
};

export function StatusBadge({ status }: { status: string }) {
  const token = statusToken(status);
  const label = STATUS_LABELS[status] ?? status;
  return <Badge variant="outline" className={STATUS_STYLE[token]}>{label}</Badge>;
}

const PRIORITY_STYLE: Record<string, string> = {
  yuksek: "bg-priority-high/15 text-priority-high border-priority-high/30",
  orta: "bg-priority-medium/15 text-priority-medium border-priority-medium/30",
  dusuk: "bg-priority-low/15 text-priority-low border-priority-low/30",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge variant="outline" className={PRIORITY_STYLE[priority] ?? ""}>{PRIORITY_LABELS[priority] ?? priority}</Badge>;
}

export function KpiCard({
  label, value, icon: Icon, hint, accent,
}: {
  label: string; value: ReactNode; icon: React.ComponentType<{ className?: string }>;
  hint?: string; accent?: "primary" | "accent" | "destructive" | "warn";
}) {
  const accentClass = accent === "accent" ? "text-accent" : accent === "destructive" ? "text-destructive" : accent === "warn" ? "text-priority-medium" : "text-primary";
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-3xl font-bold">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={`rounded-md bg-muted p-2 ${accentClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export function PageHeader({ title, description, actions, icon: Icon }: { title: string; description?: string; actions?: ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
          {Icon && <Icon className="h-7 w-7 text-primary" />}
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, icon: Icon }: {
  title: string; description?: string; icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-16 text-center">
      {Icon && <Icon className="mb-3 h-10 w-10 text-muted-foreground" />}
      <h3 className="font-medium">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
