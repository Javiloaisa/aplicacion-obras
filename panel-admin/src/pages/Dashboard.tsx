import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AuthImg from "@/components/AuthImg";
import Layout from "@/components/Layout";
import { apiGet } from "@/lib/api";
import { thisWeekRange, todayISO } from "@/lib/format";
import type { HorasReport, MediaItem, Obra } from "@/lib/types";

export default function Dashboard() {
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [week, setWeek] = useState<HorasReport | null>(null);
  const [today, setToday] = useState<HorasReport | null>(null);
  const [recent, setRecent] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const { from, to } = thisWeekRange();
    const day = todayISO();
    Promise.all([
      apiGet<Obra[]>("/api/v1/obras?status=active"),
      apiGet<HorasReport>(`/api/v1/informes/horas?from=${from}&to=${to}`),
      apiGet<HorasReport>(`/api/v1/informes/horas?from=${day}&to=${day}`),
      apiGet<MediaItem[]>("/api/v1/media/recent?limit=12"),
    ])
      .then(([obrasData, weekData, todayData, recentData]) => {
        setObras(obrasData);
        setWeek(weekData);
        setToday(todayData);
        setRecent(recentData);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar el dashboard"),
      );
  }, []);

  const activeToday = today ? new Set(today.rows.map((r) => r.user_id)).size : 0;

  // Hours this week grouped per obra
  const weekByObra = new Map<string, { name: string; hours: number }>();
  for (const row of week?.rows ?? []) {
    const existing = weekByObra.get(row.obra_id);
    const hours = (existing?.hours ?? 0) + Number(row.total_hours);
    weekByObra.set(row.obra_id, { name: row.obra_name, hours });
  }

  return (
    <Layout title="Dashboard">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Obras activas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{obras?.length ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Horas esta semana
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {week ? `${week.total_hours} h` : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Trabajadores activos hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{today ? activeToday : "—"}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Horas de la semana por obra</CardTitle>
          </CardHeader>
          <CardContent>
            {weekByObra.size === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin partes registrados esta semana.
              </p>
            ) : (
              <ul className="space-y-2">
                {[...weekByObra.entries()]
                  .sort((a, b) => b[1].hours - a[1].hours)
                  .map(([obraId, info]) => (
                    <li key={obraId} className="flex items-center justify-between text-sm">
                      <Link to={`/obras/${obraId}`} className="hover:underline">
                        {info.name}
                      </Link>
                      <span className="font-semibold">{info.hours} h</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimas subidas</CardTitle>
          </CardHeader>
          <CardContent>
            {recent && recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay archivos.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {recent?.map((item) => (
                  <Link
                    key={item.id}
                    to={`/obras/${item.obra_id}?tab=galeria`}
                    title={`${item.obra_name ?? ""} — ${item.user_full_name ?? ""}`}
                    className="relative aspect-square overflow-hidden rounded-md bg-muted"
                  >
                    {item.thumb_url ? (
                      <AuthImg
                        src={item.thumb_url}
                        alt={item.original_filename}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xl">
                        {item.kind === "video" ? "🎬" : "📷"}
                      </span>
                    )}
                    {item.kind === "video" ? (
                      <span className="absolute bottom-0 right-0 bg-black/60 px-1 text-[10px] text-white">
                        🎬
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
