import { useEffect, useMemo, useState } from "react";
import { apiGet } from "./api";
import type { Empresa } from "./types";

export const EMPRESA_NOMBRE: Record<"nido" | "fega", string> = {
  nido: "Nido Constructions",
  fega: "Fega Juan",
};

export function useEmpresas(): Empresa[] {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  useEffect(() => {
    apiGet<Empresa[]>("/api/v1/empresas")
      .then(setEmpresas)
      .catch(() => {});
  }, []);
  return empresas;
}

/** empresa_id -> Empresa, to label a row without a lookup call per row. */
export function useEmpresasById(): Map<string, Empresa> {
  const empresas = useEmpresas();
  return useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas]);
}
