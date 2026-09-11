import { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { apiGet, apiSend } from "@/lib/api";
import { EMPRESA_NOMBRE } from "@/lib/use-empresas";
import type { EmpresaSlug, Obra, User } from "@/lib/types";

const SLUGS: EmpresaSlug[] = ["nido", "fega"];

function pillClass(active: boolean): string {
  return `flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
    active ? "border-brand-500 bg-brand-500/10 font-medium" : "hover:bg-muted"
  }`;
}

export default function SinAsignar() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(() => {
    Promise.all([apiGet<User[]>("/api/v1/usuarios"), apiGet<Obra[]>("/api/v1/obras")])
      .then(([u, o]) => {
        setUsers(u);
        setObras(o);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar"));
  }, []);

  useEffect(load, [load]);

  const pendingWorkers = (users ?? []).filter((u) => u.role === "worker" && !u.empresa_id);
  const pendingObras = (obras ?? []).filter((o) => o.empresas.length === 0);
  const loaded = users !== null && obras !== null;

  function handleDone(message: string) {
    setError("");
    setSuccess(message);
    load();
  }

  return (
    <Layout title="Sin asignar">
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Clasifica los trabajadores y obras que quedaron sin empresa al activar
        multiempresa. Mientras no los clasifiques, siguen siendo visibles para
        cualquier administrador.
      </p>

      {loaded ? (
        <p className="mb-4 text-sm font-medium">
          Quedan {pendingWorkers.length}{" "}
          {pendingWorkers.length === 1 ? "trabajador" : "trabajadores"} y{" "}
          {pendingObras.length} {pendingObras.length === 1 ? "obra" : "obras"} por
          asignar.
        </p>
      ) : null}

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-brand-700">{success}</p> : null}

      {loaded && pendingWorkers.length === 0 && pendingObras.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border bg-card p-6 text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-brand-600" />
          Todo clasificado. No queda nada pendiente de asignar.
        </div>
      ) : (
        <div className="space-y-8">
          <TrabajadoresPendientes workers={pendingWorkers} onDone={handleDone} onError={setError} />
          <ObrasPendientes obras={pendingObras} onDone={handleDone} onError={setError} />
        </div>
      )}
    </Layout>
  );
}

function TrabajadoresPendientes({
  workers,
  onDone,
  onError,
}: {
  workers: User[];
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [empresa, setEmpresa] = useState<EmpresaSlug>("nido");
  const [busy, setBusy] = useState(false);

  if (workers.length === 0) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = selected.size === workers.length;

  async function submit() {
    setBusy(true);
    try {
      await apiSend("POST", "/api/v1/usuarios/asignar-empresa", {
        user_ids: [...selected],
        empresa,
      });
      onDone(
        `${selected.size} ${selected.size === 1 ? "trabajador asignado" : "trabajadores asignados"} a ${EMPRESA_NOMBRE[empresa]}.`,
      );
      setSelected(new Set());
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo asignar la empresa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">
        Trabajadores sin asignar{" "}
        <span className="text-sm font-normal text-muted-foreground">({workers.length})</span>
      </h2>
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelected(allSelected ? new Set() : new Set(workers.map((w) => w.id)))}
          >
            {allSelected ? "Quitar selección" : "Seleccionar todos"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {workers.map((w) => (
            <label key={w.id} className={pillClass(selected.has(w.id))}>
              <input
                type="checkbox"
                className="accent-brand-500"
                checked={selected.has(w.id)}
                onChange={() => toggle(w.id)}
              />
              {w.full_name}
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Select
            aria-label="Empresa destino"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value as EmpresaSlug)}
            className="w-auto"
          >
            <option value="nido">{EMPRESA_NOMBRE.nido}</option>
            <option value="fega">{EMPRESA_NOMBRE.fega}</option>
          </Select>
          <Button disabled={busy || selected.size === 0} onClick={submit}>
            Asignar a {EMPRESA_NOMBRE[empresa]}
          </Button>
        </div>
      </div>
    </section>
  );
}

function ObrasPendientes({
  obras,
  onDone,
  onError,
}: {
  obras: Obra[];
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [empresas, setEmpresas] = useState<Set<EmpresaSlug>>(new Set());
  const [busy, setBusy] = useState(false);

  if (obras.length === 0) return null;

  function toggleObra(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleEmpresa(slug: EmpresaSlug) {
    setEmpresas((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const allSelected = selected.size === obras.length;

  async function submit() {
    setBusy(true);
    try {
      await apiSend("POST", "/api/v1/obras/asignar-empresas", {
        obra_ids: [...selected],
        empresas: [...empresas],
      });
      const nombres = [...empresas].map((s) => EMPRESA_NOMBRE[s]).join(" y ");
      onDone(`${selected.size} ${selected.size === 1 ? "obra asignada" : "obras asignadas"} a ${nombres}.`);
      setSelected(new Set());
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo asignar la empresa");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">
        Obras sin asignar{" "}
        <span className="text-sm font-normal text-muted-foreground">({obras.length})</span>
      </h2>
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {selected.size} seleccionada{selected.size === 1 ? "" : "s"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSelected(allSelected ? new Set() : new Set(obras.map((o) => o.id)))}
          >
            {allSelected ? "Quitar selección" : "Seleccionar todas"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {obras.map((o) => (
            <label key={o.id} className={pillClass(selected.has(o.id))}>
              <input
                type="checkbox"
                className="accent-brand-500"
                checked={selected.has(o.id)}
                onChange={() => toggleObra(o.id)}
              />
              {o.name}
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex gap-3">
            {SLUGS.map((slug) => (
              <label key={slug} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-brand-500"
                  checked={empresas.has(slug)}
                  onChange={() => toggleEmpresa(slug)}
                />
                {EMPRESA_NOMBRE[slug]}
              </label>
            ))}
          </div>
          <Button disabled={busy || selected.size === 0 || empresas.size === 0} onClick={submit}>
            Asignar {selected.size || ""} obra{selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </section>
  );
}
