import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, Lock, Pencil, Plus, Trash2 } from "lucide-react";
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
import { TRADES, type User, type UserWithTempPassword } from "@/lib/types";

export default function Usuarios() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);

  const load = useCallback(() => {
    apiGet<User[]>("/api/v1/usuarios")
      .then(setUsers)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Error al cargar usuarios"),
      );
  }, []);

  // Default suggestions plus any trade already in use, so new ones are reusable
  const tradeSuggestions = [
    ...new Set([
      ...TRADES,
      ...(users ?? []).map((u) => u.trade).filter((t): t is string => !!t),
    ]),
  ];

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

  async function deleteUser(user: User) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente a ${user.full_name}? Esta acción no se puede deshacer.`,
      )
    )
      return;
    try {
      await apiSend("DELETE", `/api/v1/usuarios/${user.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el usuario");
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
            <UserForm
              tradeSuggestions={tradeSuggestions}
              onSaved={(created) => {
                setDialogOpen(false);
                load();
                if (created && "temp_password" in created && created.temp_password) {
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
              <TableHead>Oficio</TableHead>
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
                <TableCell>{user.trade || <span className="text-muted-foreground">—</span>}</TableCell>
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
                  <Button variant="outline" size="sm" onClick={() => setEditUser(user)}>
                    <Pencil /> Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPasswordUser(user)}>
                    <Lock /> Contraseña
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => resetPassword(user)}>
                    <KeyRound /> Reset
                  </Button>
                  {user.id !== me?.id ? (
                    <>
                      <Button
                        variant={user.is_active ? "destructive" : "default"}
                        size="sm"
                        onClick={() => toggleActive(user)}
                      >
                        {user.is_active ? "Desactivar" : "Activar"}
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => deleteUser(user)}>
                        <Trash2 /> Eliminar
                      </Button>
                    </>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit dialog */}
      <Dialog open={editUser !== null} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          {editUser ? (
            <UserForm
              existing={editUser}
              tradeSuggestions={tradeSuggestions}
              onSaved={() => {
                setEditUser(null);
                load();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Custom password dialog */}
      <Dialog
        open={passwordUser !== null}
        onOpenChange={(open) => !open && setPasswordUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>
              Elige una nueva contraseña para {passwordUser?.full_name}. El usuario podrá
              acceder con ella directamente, sin que se le pida cambiarla.
            </DialogDescription>
          </DialogHeader>
          {passwordUser ? (
            <ChangePasswordForm
              user={passwordUser}
              onSaved={() => setPasswordUser(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

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

function UserForm({
  existing,
  tradeSuggestions,
  onSaved,
}: {
  existing?: User;
  tradeSuggestions: string[];
  onSaved: (user: UserWithTempPassword | User) => void;
}) {
  const isEdit = !!existing;
  const [username, setUsername] = useState(existing?.username ?? "");
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [trade, setTrade] = useState(existing?.trade ?? "");
  const [role, setRole] = useState<"worker" | "admin">(existing?.role ?? "worker");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const payload = {
      full_name: fullName,
      email: email || null,
      phone: phone || null,
      trade: trade.trim() || null,
      role,
    };
    try {
      const saved = isEdit
        ? await apiSend<User>("PATCH", `/api/v1/usuarios/${existing!.id}`, payload)
        : await apiSend<UserWithTempPassword>("POST", "/api/v1/usuarios", {
            username,
            ...payload,
          });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el usuario");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="f-fullname">Nombre completo *</Label>
        <Input
          id="f-fullname"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="f-username">Usuario *</Label>
        <Input
          id="f-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="ej. juan.perez"
          pattern="[a-zA-Z0-9._\-]{3,50}"
          title="Letras, números, puntos, guiones; sin espacios"
          required
          disabled={isEdit}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="f-trade">Oficio</Label>
        <Input
          id="f-trade"
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          list="trade-suggestions"
          maxLength={50}
          placeholder="Elige uno o escribe uno nuevo"
        />
        <datalist id="trade-suggestions">
          {tradeSuggestions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="f-email">Email</Label>
          <Input
            id="f-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="f-phone">Teléfono</Label>
          <Input id="f-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="f-role">Rol</Label>
        <Select
          id="f-role"
          value={role}
          onChange={(e) => setRole(e.target.value as "worker" | "admin")}
        >
          <option value="worker">Trabajador</option>
          <option value="admin">Administrador</option>
        </Select>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear usuario"}
      </Button>
    </form>
  );
}

function ChangePasswordForm({
  user,
  onSaved,
}: {
  user: User;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiSend("PATCH", `/api/v1/usuarios/${user.id}`, {
        new_password: password,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">Nueva contraseña</Label>
        <Input
          id="new-password"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          maxLength={128}
          placeholder="Mínimo 8 caracteres"
          required
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Guardando..." : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
