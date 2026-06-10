import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import Layout from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Obra } from "@/lib/types";

export default function Obras() {
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "">("active");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(() => {
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    apiGet<Obra[]>(`/api/v1/obras${qs}`)
      .then(setObras)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar las obras"),
      );
  }, [statusFilter]);

  useEffect(load, [load]);

  const filtered = (obras ?? []).filter((obra) =>
    `${obra.name} ${obra.client_name ?? ""} ${obra.address ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  async function archive(obra: Obra) {
    const newStatus = obra.status === "active" ? "archived" : "active";
    await apiSend("PATCH", `/api/v1/obras/${obra.id}`, { status: newStatus });
    load();
  }

  return (
    <Layout
      title="Obras"
      actions={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> Nueva obra
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva obra</DialogTitle>
            </DialogHeader>
            <NuevaObraForm
              onCreated={() => {
                setDialogOpen(false);
                load();
              }}
            />
          </DialogContent>
        </Dialog>
      }
    >
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder="Buscar por nombre, cliente o dirección..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="w-40"
        >
          <option value="active">Activas</option>
          <option value="archived">Archivadas</option>
          <option value="">Todas</option>
        </Select>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Obra</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Creada</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((obra) => (
              <TableRow key={obra.id}>
                <TableCell className="font-medium">
                  <Link to={`/obras/${obra.id}`} className="hover:underline">
                    {obra.name}
                  </Link>
                </TableCell>
                <TableCell>{obra.client_name ?? "—"}</TableCell>
                <TableCell>{obra.address ?? "—"}</TableCell>
                <TableCell>{formatDate(obra.created_at.slice(0, 10))}</TableCell>
                <TableCell>
                  {obra.status === "active" ? (
                    <Badge variant="success">Activa</Badge>
                  ) : (
                    <Badge variant="secondary">Archivada</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => archive(obra)}>
                    {obra.status === "active" ? "Archivar" : "Reactivar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {obras !== null && filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No hay obras que mostrar.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </Layout>
  );
}

function NuevaObraForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiSend("POST", "/api/v1/obras", {
        name,
        client_name: clientName || null,
        address: address || null,
        description: description || null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la obra");
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
        {busy ? "Creando..." : "Crear obra"}
      </Button>
    </form>
  );
}
