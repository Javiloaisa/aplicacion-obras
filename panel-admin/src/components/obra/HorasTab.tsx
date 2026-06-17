import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Download, Pencil, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { apiDownload, apiGet, apiSend } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { EntriesList, User, WorkEntry } from "@/lib/types";

export default function HorasTab({
  obraId,
  workers,
}: {
  obraId: string;
  workers: User[];
}) {
  const [data, setData] = useState<EntriesList | null>(null);
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<WorkEntry | null>(null);
  const [error, setError] = useState("");

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (userId) params.set("user_id", userId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params;
  }, [userId, from, to]);

  const load = useCallback(() => {
    apiGet<EntriesList>(`/api/v1/obras/${obraId}/entries?${buildParams()}`)
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar las horas"),
      );
  }, [obraId, buildParams]);

  useEffect(load, [load]);

  // Totals per worker for the current filter
  const totals = new Map<string, { name: string; hours: number; count: number }>();
  for (const entry of data?.items ?? []) {
    const key = entry.user_id;
    const existing = totals.get(key) ?? {
      name: entry.user_full_name ?? "—",
      hours: 0,
      count: 0,
    };
    existing.hours = Math.round((existing.hours + Number(entry.hours)) * 100) / 100;
    existing.count += 1;
    totals.set(key, existing);
  }

  async function deleteEntry(entry: WorkEntry) {
    if (!window.confirm("¿Eliminar este parte definitivamente?")) return;
    await apiSend("DELETE", `/api/v1/entries/${entry.id}`);
    load();
  }

  async function toggleValidated(entry: WorkEntry) {
    await apiSend("PATCH", `/api/v1/entries/${entry.id}/validate`, {
      validated: !entry.validated,
    });
    load();
  }

  function exportCsv() {
    const params = buildParams();
    params.set("obra_id", obraId);
    apiDownload(`/api/v1/informes/horas/export.csv?${params}`, "horas.csv");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-48">
          <option value="">Todos los trabajadores</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.full_name}</option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        <Button variant="outline" onClick={exportCsv} className="ml-auto">
          <Download /> Exportar CSV
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {totals.size > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {[...totals.values()].map((t) => (
            <Badge key={t.name} variant="secondary" className="text-sm">
              {t.name}: {t.hours} h ({t.count})
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Trabajador</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead className="text-right">Horas</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Validado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{formatDate(entry.work_date)}</TableCell>
                <TableCell>{entry.user_full_name}</TableCell>
                <TableCell>
                  {entry.start_time && entry.end_time
                    ? `${entry.start_time.slice(0, 5)}–${entry.end_time.slice(0, 5)}`
                    : "—"}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {entry.hours}
                  {entry.edited_by_admin ? (
                    <span title="Editado por administrador"> *</span>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-64 truncate">{entry.notes ?? "—"}</TableCell>
                <TableCell>
                  {entry.validated ? (
                    <Badge variant="success">Validado</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">Pendiente</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {entry.validated ? (
                    <Button variant="ghost" size="icon" onClick={() => toggleValidated(entry)} title="Quitar validación">
                      <X />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      className="bg-green-600 text-white hover:bg-green-700"
                      onClick={() => toggleValidated(entry)}
                      title="Validar horas"
                    >
                      <Check />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setEditing(entry)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteEntry(entry)}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data && data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No hay partes con estos filtros.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
          {data && data.items.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right">{data.total_hours} h</TableCell>
                <TableCell colSpan={3}>{data.count} partes</TableCell>
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
    </div>
  );
}

function EditEntryForm({ entry, onSaved }: { entry: WorkEntry; onSaved: () => void }) {
  const [workDate, setWorkDate] = useState(entry.work_date);
  const [hours, setHours] = useState(entry.hours);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiSend("PATCH", `/api/v1/entries/${entry.id}`, {
        work_date: workDate,
        hours: Number(hours),
        notes: notes || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{entry.user_full_name}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="edit-date">Fecha</Label>
          <Input
            id="edit-date"
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-hours">Horas</Label>
          <Input
            id="edit-hours"
            type="number"
            min={0.25}
            max={16}
            step={0.25}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-notes">Notas</Label>
        <Textarea
          id="edit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
