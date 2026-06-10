import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import OfflineBanner from "./OfflineBanner";

export default function Layout({
  title,
  back,
  showLogout = false,
  children,
}: {
  title: string;
  back?: string;
  showLogout?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 bg-gray-900 px-3 text-white">
        {back ? (
          <button
            onClick={() => navigate(back)}
            aria-label="Volver"
            className="-ml-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl active:bg-gray-700"
          >
            ←
          </button>
        ) : null}
        <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
        {showLogout ? (
          <button
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
            className="rounded-lg px-3 py-2 text-sm text-gray-300 active:bg-gray-700"
          >
            Salir
          </button>
        ) : null}
      </header>
      <OfflineBanner />
      <main className="mx-auto max-w-lg p-4 pb-8">{children}</main>
    </div>
  );
}
