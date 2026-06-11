import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "../components/Layout";
import { ErrorMessage, Spinner } from "../components/ui";
import { apiGet } from "../lib/api";
import type { ObraDetail } from "../lib/types";

const ACTIONS = [
  { to: "parte", icon: "➕", label: "Parte de horas", hint: "Horas y fotos del trabajo" },
  { to: "actividad", icon: "🕓", label: "Mi actividad", hint: "Mis partes y fotos aquí" },
];

export default function ObraHome() {
  const { obraId } = useParams();
  const [obra, setObra] = useState<ObraDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<ObraDetail>(`/api/v1/obras/${obraId}`)
      .then(setObra)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar la obra"),
      );
  }, [obraId]);

  return (
    <Layout title={obra?.name ?? "Obra"} back="/">
      <ErrorMessage>{error}</ErrorMessage>
      {!error && obra === null ? <Spinner /> : null}
      {obra ? (
        <>
          {obra.address ? (
            <p className="mb-4 text-base text-gray-500">📍 {obra.address}</p>
          ) : null}
          <div className="space-y-4">
            {ACTIONS.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm active:bg-gray-50"
              >
                <span className="text-4xl">{action.icon}</span>
                <span>
                  <span className="block text-xl font-semibold text-gray-900">
                    {action.label}
                  </span>
                  <span className="block text-base text-gray-500">{action.hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </Layout>
  );
}
