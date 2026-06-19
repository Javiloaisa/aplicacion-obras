import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { BarChart3, Building2, LayoutDashboard, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/obras", label: "Obras", icon: Building2, end: false },
  { to: "/informes", label: "Informes", icon: BarChart3, end: true },
  { to: "/usuarios", label: "Usuarios", icon: Users, end: true },
];

export default function Layout({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col bg-ink-900 text-gray-300 md:flex">
        <div className="flex items-center justify-center border-b border-ink-700 p-4">
          <img
            src="/brand/logo.png"
            alt="FENIC Integral"
            className="h-16 w-auto rounded-lg bg-white p-1.5"
          />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-500 text-ink-900"
                    : "text-gray-300 hover:bg-white/10 hover:text-white",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-700 p-3">
          <div className="mb-2 truncate px-3 text-sm text-gray-400">
            {user?.full_name}
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-gray-300 hover:bg-white/10 hover:text-white"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut /> Cerrar sesión
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top nav */}
        <div className="flex items-center gap-2 overflow-x-auto bg-ink-900 p-2 md:hidden">
          <img
            src="/brand/logo.png"
            alt="FENIC Integral"
            className="h-9 w-auto shrink-0 rounded-md bg-white p-1"
          />
          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-500 text-ink-900"
                      : "text-gray-300 hover:bg-white/10 hover:text-white",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <main className="flex-1 p-4 md:p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {actions}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
