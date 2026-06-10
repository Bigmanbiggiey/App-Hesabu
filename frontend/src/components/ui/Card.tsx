import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export function Card({ children, className, title, action }: CardProps) {
  return (
    <div className={cn("card", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="font-semibold text-text">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
}) {
  const trendColor =
    trend === "up" ? "text-compliant" : trend === "down" ? "text-danger" : "text-muted";

  return (
    <div className="card flex items-start gap-4">
      {Icon && (
        <div className="rounded-lg bg-brand-50 p-2.5">
          <Icon className="h-5 w-5 text-brand-600" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-bold text-text mt-0.5">{value}</p>
        {sub && <p className={cn("text-xs mt-1", trendColor)}>{sub}</p>}
      </div>
    </div>
  );
}
