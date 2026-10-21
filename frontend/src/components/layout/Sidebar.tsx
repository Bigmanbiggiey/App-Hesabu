import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Calculator,
  Users,
  Building2,
  Settings,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/customers", label: "Customers", icon: Building2 },
  { to: "/payments", label: "M-Pesa Payments", icon: Smartphone },
  { to: "/taxes", label: "Tax Returns", icon: Calculator },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/reports", label: "Reports", icon: TrendingUp },
];

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const { user } = useAuth();

  return (
    <aside className="flex h-full w-full min-w-0 flex-col bg-white border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <span className="text-white font-bold text-sm">H</span>
        </div>
        <div className="min-w-0">
          <p className="font-bold text-text">Hesabu</p>
          <p className="text-xs text-muted truncate" title={user?.organization?.name}>
            {user?.organization?.name ?? "Loading..."}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              cn("sidebar-link", isActive && "sidebar-link-active")
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Settings */}
      <div className="border-t border-border px-3 py-3">
        <NavLink
          to="/settings"
          onClick={onClose}
          className={({ isActive }) =>
            cn("sidebar-link", isActive && "sidebar-link-active")
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </NavLink>
      </div>

      {/* Subscription badge */}
      <div className="px-4 py-3 border-t border-border">
        <div className="rounded-lg bg-brand-50 px-3 py-2">
          <p className="text-xs font-medium text-brand-700 capitalize">
            {user?.organization?.subscription_tier ?? "biashara"} plan
          </p>
          <p className="text-xs text-brand-600 mt-0.5">
            {user?.organization?.subscription_status === "trial"
              ? "Trial active"
              : "Subscription active"}
          </p>
        </div>
      </div>
    </aside>
  );
}
