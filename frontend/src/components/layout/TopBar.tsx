import { Menu, LogOut, User } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { useNavigate } from "react-router-dom";

interface TopBarProps {
  onMenuClick: () => void;
  title?: string;
}

export default function TopBar({ onMenuClick, title }: TopBarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="h-[calc(3.5rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex items-center justify-between px-4 border-b border-border bg-white shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-brand-50 text-muted"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        {title && <h1 className="font-semibold text-text">{title}</h1>}
      </div>

      <div className="flex items-center gap-2">
        <NotificationBell />

        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center">
            <User className="h-4 w-4 text-brand-700" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-text leading-none">
              {user?.full_name}
            </p>
            <p className="text-xs text-muted capitalize">{user?.role}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="ml-1" aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
