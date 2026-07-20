import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Trash2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiSend } from "@/lib/api";
import { formatDate, todayISO } from "@/lib/format";
import type { BlockedDay, User } from "@/lib/types";

export default function Bloqueos() {
  const [workers, setWorkers] = useState<User[]>([]);
  const [bloqueos, setBloqueos] = useState<BlockedDay[]>([]);
  const [blockedDate, setBlockedDate] = useState(todayISO());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<User[]>("/api/v1/usuarios")
      .then((users) =>
        setWorkers(users.filter((u) => u.role === "worker" && u.is_active)),
      )
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    apiGet<BlockedDay[]>("/api/v1/bloqueos")
      .then(setBloqueos)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar los bloqueos"),
      );
  }, []);

  useEffect(load, [load]);

  function toggleWorker(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setError("");
    setSaving(true);
    try {
      await apiSend("POST", "/api/v1/bloqueos", {
        blocked_date: blockedDate,
        user_ids: [...selected],
        note: note.trim() || null,
      });
      setSelected(new Set());
      setNote("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el bloqueo");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("¿Quitar este bloqueo? El trabajador podrá volver a registrar partes ese día.")) return;
    try {
      await apiSend("DELETE", `/api/v1/bloqueos/${id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar el bloqueo");
    }
  }

  return (
    <Layout title="Días bloqueados">
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Un trabajador no puede registrar ni mover partes a un día bloqueado. Úsalo
        cuando alguien no venga a trabajar, para evitar que luego meta partes
        atrasados de ese día. Tú siempre puedes crear o editar partes, aunque el día
        esté bloqueado.
      </p>

      <div className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-semibold">Bloquear un día</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="blocked-date">Fecha</Label>
            <Input
              id="blocked-date"
              type="date"
              value={blockedDate}
              onChange={(e) => setBlockedDate(e.target.value)}
            />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <Label htmlFor="note">Nota (opcional)</Label>
            <Input
              id="note"
              value={note}
              maxLength={200}
              placeholder="p. ej. No vino a trabajar"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 space-y-1">
          <Label>Trabajadores</Label>
          <div className="flex flex-wrap gap-2">
            {workers.map((w) => (
              <label
                key={w.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  selected.has(w.id)
                    ? "border-brand-500 bg-brand-500/10 font-medium"
                    : "hover:bg-muted"
                }`}
              >
                <input
                  type="checkbox"
                  className="accent-brand-500"
                  checked={selected.has(w.id)}
                  onChange={() => toggleWorker(w.id)}
                />
                {w.full_name}
              </label>
            ))}
            {workers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay trabajadores activos.</p>
            ) : null}
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <Button
          className="mt-4"
          disabled={saving || selected.size === 0 || !blockedDate}
          onClick={submit}
        >
          <CalendarOff />
          Bloquear día para {selected.size}{" "}
          {selected.size === 1 ? "trabajador" : "trabajadores"}
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Trabajador</TableHead>
              <TableHead>Nota</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bloqueos.map((b) => (
              <TableRow key={b.id}>
                <TableCell>{formatDate(b.blocked_date)}</TableCell>
                <TableCell>{b.user_full_name}</TableCell>
                <TableCell className="text-muted-foreground">{b.note ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(b.id)}
                    title="Quitar bloqueo"
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {bloqueos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No hay días bloqueados.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}
