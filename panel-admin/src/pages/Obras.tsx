import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import Layout from "@/components/Layout";
import ObraForm from "@/components/obra/ObraForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { toggleObraStatus } from "@/lib/obras";
import type { Obra } from "@/lib/types";

export default function Obras() {
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Obra | null>(null);

  const load = useCallback(() => {
    // Admins get every obra; they are split into two tables below
    apiGet<Obra[]>("/api/v1/obras")
      .then(setObras)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar las obras"),
      );
  }, []);

  useEffect(load, [load]);

  const filtered = (obras ?? []).filter((obra) =>
    `${obra.name} ${obra.client_name ?? ""} ${obra.address ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const activas = filtered.filter((obra) => obra.status === "active");
  const archivadas = filtered.filter((obra) => obra.status === "archived");

  async function archive(obra: Obra) {
    setError("");
    try {
      if (await toggleObraStatus(obra)) load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    }
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
            <ObraForm
              onSaved={() => {
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
      </div>

      <ObraTable
        title="Obras activas"
        obras={activas}
        loaded={obras !== null}
        emptyText="No hay obras activas."
        onEdit={setEditing}
        onToggleStatus={archive}
      />

      {archivadas.length > 0 ? (
        <div className="mt-8">
          <ObraTable
            title="Obras archivadas"
            hint="Los trabajadores no las ven, pero sus fotos, vídeos y horas se conservan."
            obras={archivadas}
            loaded
            onEdit={setEditing}
            onToggleStatus={archive}
          />
        </div>
      ) : null}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar obra</DialogTitle>
          </DialogHeader>
          {editing ? (
            <ObraForm
              obra={editing}
              onSaved={() => {
                setEditing(null);
                load();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function ObraTable({
  title,
  hint,
  obras,
  loaded,
  emptyText,
  onEdit,
  onToggleStatus,
}: {
  title: string;
  hint?: string;
  obras: Obra[];
  loaded: boolean;
  emptyText?: string;
  onEdit: (obra: Obra) => void;
  onToggleStatus: (obra: Obra) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold">
          {title}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({obras.length})
          </span>
        </h2>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Obra</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Creada</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {obras.map((obra) => (
              <TableRow key={obra.id}>
                <TableCell className="font-medium">
                  <Link to={`/obras/${obra.id}`} className="hover:underline">
                    {obra.name}
                  </Link>
                </TableCell>
                <TableCell>{obra.client_name ?? "—"}</TableCell>
                <TableCell>{obra.address ?? "—"}</TableCell>
                <TableCell>{formatDate(obra.created_at.slice(0, 10))}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => onEdit(obra)}>
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onToggleStatus(obra)}
                    >
                      {obra.status === "active" ? "Archivar" : "Reactivar"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {loaded && emptyText && obras.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
