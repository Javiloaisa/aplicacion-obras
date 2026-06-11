import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AuthImg from "@/components/AuthImg";
import Layout from "@/components/Layout";
import { apiGet } from "@/lib/api";
import { formatEur, thisWeekRange, todayISO } from "@/lib/format";
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
  const obraChart = [...weekByObra.values()]
    .map((o) => ({ name: o.name, horas: Math.round(o.hours * 100) / 100 }))
    .sort((a, b) => b.horas - a.horas);
  const tradeChart = (week?.by_trade ?? []).map((t) => ({
    name: t.trade || "Sin oficio",
    horas: Math.round(Number(t.total_hours) * 100) / 100,
  }));

  return (
    <Layout title="Dashboard">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Obras activas" value={obras?.length ?? "—"} />
        <KpiCard label="Horas esta semana" value={week ? `${week.total_hours} h` : "—"} />
        <KpiCard
          label="Coste semana"
          value={week ? formatEur(week.total_cost) : "—"}
        />
        <KpiCard label="Trabajadores activos hoy" value={today ? activeToday : "—"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Horas de la semana por obra</CardTitle>
          </CardHeader>
          <CardContent>
            <HoursBarChart data={obraChart} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Horas de la semana por oficio</CardTitle>
          </CardHeader>
          <CardContent>
            <HoursBarChart data={tradeChart} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Últimas subidas</CardTitle>
          </CardHeader>
          <CardContent>
            {recent && recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay archivos.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
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

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function HoursBarChart({ data }: { data: { name: string; horas: number }[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sin partes registrados esta semana.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={130}
          tick={{ fontSize: 12, fill: "#32373c" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value) => [`${value} h`, "Horas"]}
          cursor={{ fill: "rgba(249,180,20,0.1)" }}
        />
        <Bar dataKey="horas" fill="#f9b414" radius={[0, 6, 6, 0]} label={{ position: "right", fontSize: 12, fill: "#32373c" }} />
      </BarChart>
    </ResponsiveContainer>
  );
}
