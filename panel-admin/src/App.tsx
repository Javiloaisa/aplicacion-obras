import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import Bloqueos from "@/pages/Bloqueos";
import CambiarPassword from "@/pages/CambiarPassword";
import Dashboard from "@/pages/Dashboard";
import Informes from "@/pages/Informes";
import Login from "@/pages/Login";
import ObraDetalle from "@/pages/ObraDetalle";
import Obras from "@/pages/Obras";
import Usuarios from "@/pages/Usuarios";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/cambiar-password" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/cambiar-password"
        element={user ? <CambiarPassword /> : <Navigate to="/login" replace />}
      />
      <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/obras" element={<RequireAuth><Obras /></RequireAuth>} />
      <Route path="/obras/:obraId" element={<RequireAuth><ObraDetalle /></RequireAuth>} />
      <Route path="/informes" element={<RequireAuth><Informes /></RequireAuth>} />
      <Route path="/usuarios" element={<RequireAuth><Usuarios /></RequireAuth>} />
      <Route path="/bloqueos" element={<RequireAuth><Bloqueos /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
