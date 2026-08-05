import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import GaleriaTab from "@/components/obra/GaleriaTab";
import HorasTab from "@/components/obra/HorasTab";
import ObraForm from "@/components/obra/ObraForm";
import Layout from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TabsBar } from "@/components/ui/tabs";
import { apiGet } from "@/lib/api";
import { toggleObraStatus } from "@/lib/obras";
import type { ObraDetail, User } from "@/lib/types";

type Tab = "galeria" | "horas";

export default function ObraDetalle() {
  const { obraId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "galeria";
  const [obra, setObra] = useState<ObraDetail | null>(null);
  const [workers, setWorkers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  const loadObra = useCallback(() => {
    apiGet<ObraDetail>(`/api/v1/obras/${obraId}`)
      .then(setObra)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar la obra"),
      );
  }, [obraId]);

  useEffect(() => {
    loadObra();
    // For the per-worker filters in the tabs (anyone can log hours anywhere)
    apiGet<User[]>("/api/v1/usuarios")
      .then((users) => setWorkers(users.filter((u) => u.is_active)))
      .catch(() => {});
  }, [obraId, loadObra]);

  async function archive() {
    if (!obra) return;
    setError("");
    try {
      if (await toggleObraStatus(obra)) loadObra();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
    }
  }

  return (
    <Layout
      title={obra?.name ?? "Obra"}
      actions={
        <div className="flex items-center gap-3">
          {obra ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                Editar
              </Button>
              <Button variant="outline" size="sm" onClick={archive}>
                {obra.status === "active" ? "Archivar" : "Reactivar"}
              </Button>
            </>
          ) : null}
          <Link
            to="/obras"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a obras
          </Link>
        </div>
      }
    >
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {obra ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {obra.status === "archived" ? <Badge variant="secondary">Archivada</Badge> : null}
          {obra.client_name ? <span>{obra.client_name}</span> : null}
          {obra.address ? <span>· {obra.address}</span> : null}
          <span>
            · {obra.photo_count} fotos · {obra.video_count} vídeos · {obra.total_hours} h
          </span>
        </div>
      ) : null}

      <div className="mb-4">
        <TabsBar
          value={tab}
          onChange={(value) => setSearchParams({ tab: value })}
          tabs={[
            { value: "galeria", label: "Galería" },
            { value: "horas", label: "Horas" },
          ]}
        />
      </div>

      {obraId ? (
        <>
          {tab === "galeria" ? <GaleriaTab obraId={obraId} workers={workers} /> : null}
          {tab === "horas" ? <HorasTab obraId={obraId} workers={workers} /> : null}
        </>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar obra</DialogTitle>
          </DialogHeader>
          {obra ? (
            <ObraForm
              obra={obra}
              onSaved={() => {
                setEditOpen(false);
                loadObra();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
