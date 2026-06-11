import { useCallback, useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDownload, apiGet } from "@/lib/api";
import { thisMonthRange } from "@/lib/format";
import type { HorasReport, Obra, User } from "@/lib/types";

export default function Informes() {
  const initial = thisMonthRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [obraId, setObraId] = useState("");
  const [userId, setUserId] = useState("");
  const [obras, setObras] = useState<Obra[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [report, setReport] = useState<HorasReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<Obra[]>("/api/v1/obras").then(setObras).catch(() => {});
    apiGet<User[]>("/api/v1/usuarios").then(setUsers).catch(() => {});
  }, []);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (obraId) params.set("obra_id", obraId);
    if (userId) params.set("user_id", userId);
    return params;
  }, [from, to, obraId, userId]);

  useEffect(() => {
    apiGet<HorasReport>(`/api/v1/informes/horas?${buildParams()}`)
      .then(setReport)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar el informe"),
      );
  }, [buildParams]);

  return (
    <Layout
      title="Informes de horas"
      actions={
        <div className="flex gap-2">
          <Button
            onClick={() => apiDownload(`/api/v1/informes/horas/export.pdf?${buildParams()}`, "informe_horas.pdf")}
          >
            <FileText /> Informe PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => apiDownload(`/api/v1/informes/horas/export.csv?${buildParams()}`, "horas.csv")}
          >
            <Download /> CSV
          </Button>
        </div>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="from">Desde</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Hasta</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="obra">Obra</Label>
          <Select id="obra" value={obraId} onChange={(e) => setObraId(e.target.value)}>
            <option value="">Todas</option>
            {obras.map((obra) => (
              <option key={obra.id} value={obra.id}>{obra.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="user">Trabajador</Label>
          <Select id="user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Todos</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.full_name}</option>
            ))}
          </Select>
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {/* Headline totals */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Horas totales</p>
          <p className="text-2xl font-bold">{report?.total_hours ?? "0"} h</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Partes</p>
          <p className="text-2xl font-bold">{report?.total_entries ?? 0}</p>
        </div>
      </div>

      {/* Breakdown by trade */}
      {report && report.by_trade.length > 0 ? (
        <div className="mb-4 rounded-xl border bg-card">
          <div className="border-b px-4 py-2 text-sm font-semibold">Por oficio</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Oficio</TableHead>
                <TableHead className="text-right">Horas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.by_trade.map((t) => (
                <TableRow key={t.trade ?? "—"}>
                  <TableCell>{t.trade || <span className="text-muted-foreground">Sin oficio</span>}</TableCell>
                  <TableCell className="text-right">{t.total_hours} h</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Obra</TableHead>
              <TableHead>Trabajador</TableHead>
              <TableHead>Oficio</TableHead>
              <TableHead className="text-right">Partes</TableHead>
              <TableHead className="text-right">Horas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report?.rows.map((row) => (
              <TableRow key={`${row.obra_id}-${row.user_id}`}>
                <TableCell>{row.obra_name}</TableCell>
                <TableCell>{row.user_full_name}</TableCell>
                <TableCell>{row.trade || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right">{row.entry_count}</TableCell>
                <TableCell className="text-right font-semibold">{row.total_hours}</TableCell>
              </TableRow>
            ))}
            {report && report.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No hay horas registradas con estos filtros.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
          {report && report.rows.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right">{report.total_entries}</TableCell>
                <TableCell className="text-right">{report.total_hours} h</TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </Layout>
  );
}
