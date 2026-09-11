import type { EmpresaSlug } from "./types";

// Persisted so a reload keeps the chosen filter. Read directly by api.ts
// (outside React) on every request; the context in empresa-filtro-context.tsx
// is a thin reactive wrapper around the same storage for components.
const KEY = "pdo_empresa_filtro";

/** null = "Todas" (no filter). Only meaningful for an admin with acceso_todas_empresas. */
export type EmpresaFiltro = EmpresaSlug | null;

export function getEmpresaFiltro(): EmpresaFiltro {
  const value = localStorage.getItem(KEY);
  return value === "nido" || value === "fega" ? value : null;
}

export function setEmpresaFiltro(value: EmpresaFiltro): void {
  if (value) localStorage.setItem(KEY, value);
  else localStorage.removeItem(KEY);
}

export function clearEmpresaFiltro(): void {
  localStorage.removeItem(KEY);
}
