import { apiSend } from "./api";
import type { Obra } from "./types";

/**
 * Ask for confirmation and flip the obra between active and archived.
 * Returns false when the user cancels; errors bubble up to the caller.
 */
export async function toggleObraStatus(obra: Obra): Promise<boolean> {
  const newStatus = obra.status === "active" ? "archived" : "active";
  const message =
    newStatus === "archived"
      ? `¿Archivar "${obra.name}"? Se conservan las fotos, los vídeos y las horas, pero los trabajadores dejarán de verla y no podrán registrar partes ni subir archivos en ella. Podrás reactivarla cuando quieras.`
      : `¿Reactivar "${obra.name}"? Volverá a aparecer en la app de los trabajadores.`;
  if (!window.confirm(message)) return false;
  await apiSend("PATCH", `/api/v1/obras/${obra.id}`, { status: newStatus });
  return true;
}
