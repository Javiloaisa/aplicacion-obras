import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiSend } from "@/lib/api";
import type { Obra } from "@/lib/types";

/** Create (no obra) or edit (obra given) — same four fields either way. */
export default function ObraForm({
  obra,
  onSaved,
}: {
  obra?: Obra;
  onSaved: () => void;
}) {
  const [name, setName] = useState(obra?.name ?? "");
  const [clientName, setClientName] = useState(obra?.client_name ?? "");
  const [address, setAddress] = useState(obra?.address ?? "");
  const [description, setDescription] = useState(obra?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    // status is never sent here: archiving goes through toggleObraStatus
    const body = {
      name,
      client_name: clientName || null,
      address: address || null,
      description: description || null,
    };
    try {
      if (obra) {
        await apiSend("PATCH", `/api/v1/obras/${obra.id}`, body);
      } else {
        await apiSend("POST", "/api/v1/obras", body);
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : obra
            ? "No se pudo guardar la obra"
            : "No se pudo crear la obra",
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="obra-name">Nombre *</Label>
        <Input
          id="obra-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Reforma Calle Mayor 12"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="obra-client">Cliente</Label>
        <Input
          id="obra-client"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="obra-address">Dirección</Label>
        <Input
          id="obra-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="obra-description">Descripción</Label>
        <Textarea
          id="obra-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy
          ? obra
            ? "Guardando..."
            : "Creando..."
          : obra
            ? "Guardar cambios"
            : "Crear obra"}
      </Button>
    </form>
  );
}
