import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend } from "@/lib/api";
import type { Obra } from "@/lib/types";

interface EditableEntry {
  id: string;
  obra_id: string;
  work_date: string;
  hours: string;
  notes: string | null;
  user_full_name: string | null;
}

export default function EditEntryForm({
  entry,
  onSaved,
}: {
  entry: EditableEntry;
  onSaved: () => void;
}) {
  const [obraId, setObraId] = useState(entry.obra_id);
  const [obras, setObras] = useState<Obra[]>([]);
  const [workDate, setWorkDate] = useState(entry.work_date);
  const [hours, setHours] = useState(entry.hours);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<Obra[]>("/api/v1/obras").then(setObras).catch(() => {});
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiSend("PATCH", `/api/v1/entries/${entry.id}`, {
        obra_id: obraId,
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
      <div className="space-y-2">
        <Label htmlFor="edit-obra">Obra</Label>
        <Select id="edit-obra" value={obraId} onChange={(e) => setObraId(e.target.value)} required>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </Select>
      </div>
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
