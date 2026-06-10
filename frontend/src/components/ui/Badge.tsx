import { cn } from "@/lib/utils";

type Variant = "green" | "yellow" | "red" | "gray" | "blue";

interface BadgeProps {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}

const variantMap: Record<Variant, string> = {
  green: "badge-green",
  yellow: "badge-yellow",
  red: "badge-red",
  gray: "badge-gray",
  blue: "badge-blue",
};

export function Badge({ children, variant = "gray", className }: BadgeProps) {
  return (
    <span className={cn(variantMap[variant], className)}>{children}</span>
  );
}
