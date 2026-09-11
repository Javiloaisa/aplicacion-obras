import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CalendarOff,
  Inbox,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { apiGet, apiSend } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useEmpresaFiltro } from "@/lib/empresa-filtro-context";
import { cn } from "@/lib/utils";
import type { EmpresaSlug, PendientesResumen, User } from "@/lib/types";

const EMPRESA_NOMBRE: Record<EmpresaSlug, string> = {
  nido: "Nido Constructions",
  fega: "Fega Juan",
};

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end: boolean;
  badge?: number;
}

const BASE_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/obras", label: "Obras", icon: Building2, end: false },
  { to: "/informes", label: "Informes", icon: BarChart3, end: true },
  { to: "/usuarios", label: "Usuarios", icon: Users, end: true },
  { to: "/bloqueos", label: "Bloqueos", icon: CalendarOff, end: true },
];

/** Refetched on mount and window focus, mirroring the dashboard KPI pattern. */
function useSinAsignarCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (user?.role !== "admin") return;
    const load = () =>
      apiGet<PendientesResumen>("/api/v1/empresas/pendientes")
        .then((r) => setCount(r.trabajadores + r.obras))
        .catch(() => {});
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [user?.role]);

  return count;
}

function EmpresaSelector() {
  const { user, updateUser } = useAuth();
  const { empresaFiltro, setEmpresaFiltro } = useEmpresaFiltro();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!user?.acceso_todas_empresas) return null;

  async function quedarseSoloCon(empresa: EmpresaSlug) {
    const otra = empresa === "nido" ? EMPRESA_NOMBRE.fega : EMPRESA_NOMBRE.nido;
    if (
      !window.confirm(
        `Dejarás de ver los partes, obras y trabajadores de ${otra}. ` +
          "Solo otro administrador con acceso a ambas empresas podrá devolverte el acceso.\n\n" +
          `¿Quedarte solo con ${EMPRESA_NOMBRE[empresa]}?`,
      )
    )
      return;
    setError("");
    setBusy(true);
    try {
      const updated = await apiSend<User>("POST", "/api/v1/me/empresa", { empresa });
      updateUser(updated);
      setEmpresaFiltro(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar tu acceso");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Select
        aria-label="Filtrar por empresa"
        value={empresaFiltro ?? "todas"}
        onChange={(e) => {
          const value = e.target.value;
          setEmpresaFiltro(value === "todas" ? null : (value as EmpresaSlug));
        }}
        className="h-8 w-auto bg-white text-xs"
      >
        <option value="todas">Todas las empresas</option>
        <option value="nido">{EMPRESA_NOMBRE.nido}</option>
        <option value="fega">{EMPRESA_NOMBRE.fega}</option>
      </Select>
      {empresaFiltro ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          disabled={busy}
          onClick={() => quedarseSoloCon(empresaFiltro)}
        >
          Quedarme solo con {EMPRESA_NOMBRE[empresaFiltro]}
        </Button>
      ) : null}
      {error ? <span className="text-destructive">{error}</span> : null}
    </div>
  );
}

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
  const sinAsignarCount = useSinAsignarCount();

  const nav = [
    ...BASE_NAV,
    ...(sinAsignarCount > 0
      ? [{ to: "/sin-asignar", label: "Sin asignar", icon: Inbox, end: true, badge: sinAsignarCount }]
      : []),
  ];

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
          {nav.map(({ to, label, icon: Icon, end, badge }) => (
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
              {badge ? (
                <span className="ml-auto rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-ink-900">
                  {badge}
                </span>
              ) : null}
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
            {nav.map(({ to, label, end, badge }) => (
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
                {badge ? ` (${badge})` : ""}
              </NavLink>
            ))}
          </nav>
        </div>

        {user?.acceso_todas_empresas ? (
          <div className="border-b bg-muted/30 px-4 py-2 md:px-6">
            <EmpresaSelector />
          </div>
        ) : null}

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
