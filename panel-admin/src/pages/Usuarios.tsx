import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, Plus } from "lucide-react";
import Layout from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { apiGet, apiSend } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { User, UserWithTempPassword } from "@/lib/types";

export default function Usuarios() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);

  const load = useCallback(() => {
    apiGet<User[]>("/api/v1/usuarios")
      .then(setUsers)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar usuarios"),
      );
  }, []);

  useEffect(load, [load]);

  async function toggleActive(user: User) {
    await apiSend("PATCH", `/api/v1/usuarios/${user.id}`, {
      is_active: !user.is_active,
    });
    load();
  }

  async function resetPassword(user: User) {
    if (!window.confirm(`¿Generar nueva contraseña para ${user.full_name}?`)) return;
    const updated = await apiSend<UserWithTempPassword>(
      "PATCH",
      `/api/v1/usuarios/${user.id}`,
      { reset_password: true },
    );
    if (updated.temp_password) {
      setTempPassword({ name: user.full_name, password: updated.temp_password });
    }
  }

  return (
    <Layout
      title="Usuarios"
      actions={
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> Nuevo usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo usuario</DialogTitle>
            </DialogHeader>
            <NuevoUsuarioForm
              onCreated={(created) => {
                setDialogOpen(false);
                load();
                if (created.temp_password) {
                  setTempPassword({
                    name: created.full_name,
                    password: created.temp_password,
                  });
                }
              }}
            />
          </DialogContent>
        </Dialog>
      }
    >
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.full_name}</TableCell>
                <TableCell>@{user.username}</TableCell>
                <TableCell>
                  {user.role === "admin" ? (
                    <Badge>Admin</Badge>
                  ) : (
                    <Badge variant="secondary">Trabajador</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {user.is_active ? (
                    <Badge variant="success">Activo</Badge>
                  ) : (
                    <Badge variant="destructive">Desactivado</Badge>
                  )}
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => resetPassword(user)}>
                    <KeyRound /> Reset contraseña
                  </Button>
                  {user.id !== me?.id ? (
                    <Button
                      variant={user.is_active ? "destructive" : "default"}
                      size="sm"
                      onClick={() => toggleActive(user)}
                    >
                      {user.is_active ? "Desactivar" : "Activar"}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={tempPassword !== null}
        onOpenChange={(open) => !open && setTempPassword(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contraseña temporal</DialogTitle>
            <DialogDescription>
              Apúntala ahora: no se volverá a mostrar. El usuario deberá cambiarla en su
              primer acceso.
            </DialogDescription>
          </DialogHeader>
          {tempPassword ? (
            <div className="space-y-2 text-center">
              <p className="text-sm text-muted-foreground">{tempPassword.name}</p>
              <p className="select-all rounded-md bg-muted p-4 font-mono text-2xl tracking-wider">
                {tempPassword.password}
              </p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function NuevoUsuarioForm({
  onCreated,
}: {
  onCreated: (user: UserWithTempPassword) => void;
}) {
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"worker" | "admin">("worker");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const created = await apiSend<UserWithTempPassword>("POST", "/api/v1/usuarios", {
        username,
        full_name: fullName,
        email: email || null,
        phone: phone || null,
        role,
      });
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-fullname">Nombre completo *</Label>
        <Input
          id="new-fullname"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-username">Usuario *</Label>
        <Input
          id="new-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="ej. juan.perez"
          pattern="[a-zA-Z0-9._\-]{3,50}"
          title="Letras, números, puntos, guiones; sin espacios"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="new-email">Email</Label>
          <Input
            id="new-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-phone">Teléfono</Label>
          <Input
            id="new-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-role">Rol</Label>
        <Select
          id="new-role"
          value={role}
          onChange={(e) => setRole(e.target.value as "worker" | "admin")}
        >
          <option value="worker">Trabajador</option>
          <option value="admin">Administrador</option>
        </Select>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Creando..." : "Crear usuario"}
      </Button>
    </form>
  );
}
