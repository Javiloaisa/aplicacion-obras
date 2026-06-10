import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
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
        <Button
          variant="outline"
          onClick={() => apiDownload(`/api/v1/informes/horas/export.csv?${buildParams()}`, "horas.csv")}
        >
          <Download /> Exportar CSV
        </Button>
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

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Obra</TableHead>
              <TableHead>Trabajador</TableHead>
              <TableHead className="text-right">Partes</TableHead>
              <TableHead className="text-right">Horas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report?.rows.map((row) => (
              <TableRow key={`${row.obra_id}-${row.user_id}`}>
                <TableCell>{row.obra_name}</TableCell>
                <TableCell>{row.user_full_name}</TableCell>
                <TableCell className="text-right">{row.entry_count}</TableCell>
                <TableCell className="text-right font-semibold">{row.total_hours}</TableCell>
              </TableRow>
            ))}
            {report && report.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No hay horas registradas con estos filtros.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
          {report && report.rows.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total</TableCell>
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
