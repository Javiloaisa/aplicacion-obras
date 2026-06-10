import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth-context";
import Actividad from "./pages/Actividad";
import CambiarPassword from "./pages/CambiarPassword";
import Historial from "./pages/Historial";
import Login from "./pages/Login";
import MisObras from "./pages/MisObras";
import ObraHome from "./pages/ObraHome";
import Parte from "./pages/Parte";
import Subida from "./pages/Subida";

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
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/cambiar-password"
        element={user ? <CambiarPassword /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <MisObras />
          </RequireAuth>
        }
      />
      <Route
        path="/historial"
        element={
          <RequireAuth>
            <Historial />
          </RequireAuth>
        }
      />
      <Route
        path="/obras/:obraId"
        element={
          <RequireAuth>
            <ObraHome />
          </RequireAuth>
        }
      />
      <Route
        path="/obras/:obraId/parte"
        element={
          <RequireAuth>
            <Parte />
          </RequireAuth>
        }
      />
      <Route
        path="/obras/:obraId/subir"
        element={
          <RequireAuth>
            <Subida />
          </RequireAuth>
        }
      />
      <Route
        path="/obras/:obraId/actividad"
        element={
          <RequireAuth>
            <Actividad />
          </RequireAuth>
        }
      />
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
