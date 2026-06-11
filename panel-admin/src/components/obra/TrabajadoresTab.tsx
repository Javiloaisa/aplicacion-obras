import { useEffect, useMemo, useState } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend } from "@/lib/api";
import type { User } from "@/lib/types";

export default function TrabajadoresTab({
  obraId,
  workers,
  onChanged,
}: {
  obraId: string;
  workers: User[];
  onChanged: (workers: User[]) => void;
}) {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<User[]>("/api/v1/usuarios")
      .then(setAllUsers)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar usuarios"),
      );
  }, []);

  const assignedIds = useMemo(() => new Set(workers.map((w) => w.id)), [workers]);

  const candidates = allUsers.filter(
    (user) =>
      user.is_active &&
      !assignedIds.has(user.id) &&
      user.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  async function update(add: string[], remove: string[]) {
    try {
      const updated = await apiSend<User[]>(
        "POST",
        `/api/v1/obras/${obraId}/assignments`,
        { add, remove },
      );
      onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {error ? <p className="text-sm text-destructive lg:col-span-2">{error}</p> : null}

      <div>
        <h3 className="mb-3 font-semibold">
          Asignados <Badge variant="secondary">{workers.length}</Badge>
        </h3>
        {workers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nadie asignado todavía. Añade trabajadores desde la lista.
          </p>
        ) : (
          <ul className="space-y-2">
            {workers.map((worker) => (
              <li
                key={worker.id}
                className="flex items-center justify-between rounded-md border bg-card p-3"
              >
                <div>
                  <div className="text-sm font-medium">
                    {worker.full_name}
                    {worker.trade ? (
                      <Badge variant="outline" className="ml-2">{worker.trade}</Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">@{worker.username}</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => update([], [worker.id])}
                >
                  <UserMinus /> Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-3 font-semibold">Añadir trabajadores</h3>
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3"
        />
        <ul className="space-y-2">
          {candidates.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between rounded-md border bg-card p-3"
            >
              <div>
                <div className="text-sm font-medium">
                  {user.full_name}
                  {user.trade ? (
                    <Badge variant="outline" className="ml-2">{user.trade}</Badge>
                  ) : null}
                  {user.role === "admin" ? (
                    <Badge variant="outline" className="ml-2">admin</Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">@{user.username}</div>
              </div>
              <Button size="sm" onClick={() => update([user.id], [])}>
                <UserPlus /> Asignar
              </Button>
            </li>
          ))}
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay más usuarios disponibles.</p>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
