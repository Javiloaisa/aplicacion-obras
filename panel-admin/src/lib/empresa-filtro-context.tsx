import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  getEmpresaFiltro,
  setEmpresaFiltro as persistEmpresaFiltro,
  type EmpresaFiltro,
} from "./empresa-filtro";

interface EmpresaFiltroContextValue {
  empresaFiltro: EmpresaFiltro;
  setEmpresaFiltro: (value: EmpresaFiltro) => void;
}

const EmpresaFiltroContext = createContext<EmpresaFiltroContextValue | null>(null);

export function EmpresaFiltroProvider({ children }: { children: ReactNode }) {
  const [empresaFiltro, setState] = useState<EmpresaFiltro>(getEmpresaFiltro);

  const setEmpresaFiltro = useCallback((value: EmpresaFiltro) => {
    persistEmpresaFiltro(value);
    setState(value);
  }, []);

  return (
    <EmpresaFiltroContext.Provider value={{ empresaFiltro, setEmpresaFiltro }}>
      {children}
    </EmpresaFiltroContext.Provider>
  );
}

export function useEmpresaFiltro(): EmpresaFiltroContextValue {
  const ctx = useContext(EmpresaFiltroContext);
  if (!ctx) throw new Error("useEmpresaFiltro must be used within EmpresaFiltroProvider");
  return ctx;
}
