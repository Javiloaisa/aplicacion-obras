import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiSend } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { EMPRESA_NOMBRE, useEmpresasById } from "@/lib/use-empresas";
import type { EmpresaSlug, Obra } from "@/lib/types";

const SLUGS: EmpresaSlug[] = ["nido", "fega"];

function EmpresasCheckboxes({
  selected,
  onChange,
}: {
  selected: Set<EmpresaSlug>;
  onChange: (next: Set<EmpresaSlug>) => void;
}) {
  function toggle(slug: EmpresaSlug) {
    const next = new Set(selected);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <Label>Empresas que trabajan en esta obra</Label>
      <div className="flex flex-wrap gap-2">
        {SLUGS.map((slug) => (
          <label
            key={slug}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
              selected.has(slug)
                ? "border-brand-500 bg-brand-500/10 font-medium"
                : "hover:bg-muted"
            }`}
          >
            <input
              type="checkbox"
              className="accent-brand-500"
              checked={selected.has(slug)}
              onChange={() => toggle(slug)}
            />
            {EMPRESA_NOMBRE[slug]}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Sin marcar ninguna, la obra queda «sin asignar» y la ven todas las empresas
        hasta que se clasifique.
      </p>
    </div>
  );
}

/** Empresa slugs an obra is assigned to, from the slugs already on the object
 * (edit) or empty (create, defaulted separately once the lookup is ready). */
function initialSelection(obra: Obra | undefined): Set<EmpresaSlug> {
  return new Set(obra?.empresas ?? []);
}

/** Create (no obra) or edit (obra given) — same fields either way. */
export default function ObraForm({
  obra,
  onSaved,
}: {
  obra?: Obra;
  onSaved: () => void;
}) {
  const { user: me } = useAuth();
  const empresasById = useEmpresasById();
  const [name, setName] = useState(obra?.name ?? "");
  const [clientName, setClientName] = useState(obra?.client_name ?? "");
  const [address, setAddress] = useState(obra?.address ?? "");
  const [description, setDescription] = useState(obra?.description ?? "");
  const [selected, setSelected] = useState<Set<EmpresaSlug>>(() => initialSelection(obra));
  const [selectionTouched, setSelectionTouched] = useState(!!obra);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Creating: preselect the admin's own empresa once the id->slug lookup is
  // ready (Empresa[] is fetched async, so this can't be the useState initial value).
  useEffect(() => {
    if (obra || selectionTouched || !me || me.acceso_todas_empresas || !me.empresa_id) return;
    const slug = empresasById.get(me.empresa_id)?.slug;
    if (slug) setSelected(new Set([slug]));
  }, [obra, selectionTouched, me, empresasById]);

  const mustPickAtLeastOne = !!me?.acceso_todas_empresas;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mustPickAtLeastOne && selected.size === 0) {
      setError("Marca al menos una empresa.");
      return;
    }
    setBusy(true);
    // status is never sent here: archiving goes through toggleObraStatus
    const body = {
      name,
      client_name: clientName || null,
      address: address || null,
      description: description || null,
    };
    try {
      const target = obra
        ? await apiSend<Obra>("PATCH", `/api/v1/obras/${obra.id}`, body)
        : await apiSend<Obra>("POST", "/api/v1/obras", body);
      const empresas = [...selected];
      const changed =
        !obra || empresas.length !== obra.empresas.length ||
        empresas.some((s) => !obra.empresas.includes(s));
      if (changed) {
        await apiSend<Obra>("PUT", `/api/v1/obras/${target.id}/empresas`, { empresas });
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
      <EmpresasCheckboxes
        selected={selected}
        onChange={(next) => {
          setSelected(next);
          setSelectionTouched(true);
        }}
      />
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
