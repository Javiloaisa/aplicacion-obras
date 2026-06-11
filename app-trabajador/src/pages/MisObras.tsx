import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import { EmptyState, ErrorMessage, Spinner } from "../components/ui";
import { apiGet, SessionExpiredError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import type { Obra } from "../lib/types";

export default function MisObras() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<Obra[]>("/api/v1/obras")
      .then((data) => {
        // With a single obra, go straight in (fewer taps) — but only once
        // per session so the back button still reaches this screen
        if (data.length === 1 && !sessionStorage.getItem("pdo_auto_entered")) {
          sessionStorage.setItem("pdo_auto_entered", "1");
          navigate(`/obras/${data[0].id}`, { replace: true });
        } else {
          setObras(data);
        }
      })
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          navigate("/login", { replace: true });
        } else {
          setError(err instanceof Error ? err.message : "Error al cargar las obras");
        }
      });
  }, [navigate]);

  return (
    <Layout title={`Hola, ${user?.full_name?.split(" ")[0] ?? ""}`} showLogout>
      <h2 className="mb-4 text-xl font-bold text-gray-900">Elige la obra</h2>
      <ErrorMessage>{error}</ErrorMessage>
      {!error && obras === null ? <Spinner /> : null}
      {obras !== null && obras.length === 0 ? (
        <EmptyState>
          No hay obras activas todavía. Habla con tu jefe.
        </EmptyState>
      ) : null}
      <div className="space-y-3">
        {obras?.map((obra) => (
          <Link
            key={obra.id}
            to={`/obras/${obra.id}`}
            className="block rounded-2xl bg-white p-5 shadow-sm active:bg-gray-50"
          >
            <div className="text-lg font-semibold text-gray-900">{obra.name}</div>
            {obra.address ? (
              <div className="mt-1 text-base text-gray-500">📍 {obra.address}</div>
            ) : null}
            {obra.client_name ? (
              <div className="mt-1 text-sm text-gray-400">{obra.client_name}</div>
            ) : null}
          </Link>
        ))}
      </div>

      {obras !== null ? (
        <Link
          to="/historial"
          className="mt-6 flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm active:bg-gray-50"
        >
          <span className="text-3xl">🕓</span>
          <span className="text-lg font-semibold text-gray-900">
            Mis horas (semana y mes)
          </span>
        </Link>
      ) : null}
    </Layout>
  );
}
