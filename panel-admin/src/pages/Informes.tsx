import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Camera, Check, Download, FileText, MessageSquare, Pencil, Trash2, X } from "lucide-react";
import EditEntryForm from "@/components/EditEntryForm";
import EntryMediaDialog from "@/components/EntryMediaDialog";
import Layout from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { apiDownload, apiGet, apiSend } from "@/lib/api";
import { formatDate, formatHours, thisMonthRange } from "@/lib/format";
import type { HorasEntryRow, HorasReport, Obra, User } from "@/lib/types";

export default function Informes() {
  // Initial filters can be preset from the URL (e.g. dashboard links). An empty
  // `from`/`to` in the URL means "all history"; absent means default to this month.
  const [searchParams] = useSearchParams();
  const initial = thisMonthRange();
  const [from, setFrom] = useState(searchParams.get("from") ?? initial.from);
  const [to, setTo] = useState(searchParams.get("to") ?? initial.to);
  const [obraId, setObraId] = useState(searchParams.get("obra_id") ?? "");
  const [userId, setUserId] = useState(searchParams.get("user_id") ?? "");
  const [validated, setValidated] = useState(searchParams.get("validated") ?? "");
  const [obras, setObras] = useState<Obra[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [report, setReport] = useState<HorasReport | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<HorasEntryRow | null>(null);
  const [mediaEntry, setMediaEntry] = useState<HorasEntryRow | null>(null);
  const [noteEntry, setNoteEntry] = useState<HorasEntryRow | null>(null);

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
    if (validated) params.set("validated", validated);
    return params;
  }, [from, to, obraId, userId, validated]);

  const load = useCallback(() => {
    apiGet<HorasReport>(`/api/v1/informes/horas?${buildParams()}`)
      .then(setReport)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar el informe"),
      );
  }, [buildParams]);

  useEffect(load, [load]);

  async function toggleValidated(entryId: string, validated: boolean) {
    await apiSend("PATCH", `/api/v1/entries/${entryId}/validate`, { validated });
    load();
  }

  async function deleteEntry(entryId: string) {
    if (!window.confirm("¿Eliminar este parte definitivamente?")) return;
    await apiSend("DELETE", `/api/v1/entries/${entryId}`);
    load();
  }

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
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
        <div className="space-y-1">
          <Label htmlFor="validated">Validado</Label>
          <Select id="validated" value={validated} onChange={(e) => setValidated(e.target.value)}>
            <option value="">Todos</option>
            <option value="true">Validados</option>
            <option value="false">Pendientes</option>
          </Select>
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {/* Headline totals */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Horas totales</p>
          <p className="text-2xl font-bold">{report ? formatHours(report.total_hours) : "0h 00m"}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Partes</p>
          <p className="text-2xl font-bold">{report?.total_entries ?? 0}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Obra</TableHead>
              <TableHead>Trabajador</TableHead>
              <TableHead className="text-right">Horas</TableHead>
              <TableHead>Validado</TableHead>
              <TableHead>Nota</TableHead>
              <TableHead>Fotos</TableHead>
              <TableHead className="sticky right-0 bg-card text-right shadow-[-4px_0_4px_-4px_rgba(0,0,0,0.15)]">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report?.entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatDate(entry.work_date)}</TableCell>
                <TableCell>{entry.obra_name}</TableCell>
                <TableCell>{entry.user_full_name}</TableCell>
                <TableCell className="text-right font-semibold">
                  {formatHours(entry.hours)}
                  {entry.edited_by_admin ? (
                    <span title="Editado por administrador"> *</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  {entry.validated ? (
                    <Badge variant="success">Validado</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">Pendiente</span>
                  )}
                </TableCell>
                <TableCell>
                  {entry.notes ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNoteEntry(entry)}
                      title={entry.notes}
                    >
                      <MessageSquare />
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={entry.media_count === 0}
                    onClick={() => setMediaEntry(entry)}
                  >
                    <Camera /> {entry.media_count}
                  </Button>
                </TableCell>
                <TableCell className="sticky right-0 bg-card text-right shadow-[-4px_0_4px_-4px_rgba(0,0,0,0.15)]">
                  {entry.validated ? (
                    <Button variant="ghost" size="icon" onClick={() => toggleValidated(entry.id, false)} title="Quitar validación">
                      <X />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      className="bg-green-600 text-white hover:bg-green-700"
                      onClick={() => toggleValidated(entry.id, true)}
                      title="Validar horas"
                    >
                      <Check />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setEditing(entry)} title="Editar parte">
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteEntry(entry.id)} title="Eliminar parte">
                    <Trash2 className="text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {report && report.entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  No hay horas registradas con estos filtros.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
          {report && report.entries.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right">{formatHours(report.total_hours)}</TableCell>
                <TableCell colSpan={4}>{report.total_entries} partes</TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar parte</DialogTitle>
          </DialogHeader>
          {editing ? (
            <EditEntryForm
              entry={editing}
              onSaved={() => {
                setEditing(null);
                load();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={noteEntry !== null} onOpenChange={(open) => !open && setNoteEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Nota — {noteEntry?.user_full_name} ({noteEntry ? formatDate(noteEntry.work_date) : ""})
            </DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{noteEntry?.notes}</p>
        </DialogContent>
      </Dialog>

      {mediaEntry ? (
        <EntryMediaDialog
          obraId={mediaEntry.obra_id}
          entryId={mediaEntry.id}
          open={mediaEntry !== null}
          onClose={() => setMediaEntry(null)}
        />
      ) : null}
    </Layout>
  );
}
