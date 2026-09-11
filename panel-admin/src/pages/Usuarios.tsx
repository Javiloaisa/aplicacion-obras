import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Eye, KeyRound, Lock, Pencil, Plus, Trash2 } from "lucide-react";
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
import { EMPRESA_NOMBRE, useEmpresasById } from "@/lib/use-empresas";
import {
  TRADES,
  type Empresa,
  type EmpresaSlug,
  type User,
  type UserWithTempPassword,
} from "@/lib/types";

function EmpresaLabel({ user, empresasById }: { user: User; empresasById: Map<string, Empresa> }) {
  if (user.acceso_todas_empresas) return <Badge variant="secondary">Ambas empresas</Badge>;
  if (!user.empresa_id) return <span className="text-muted-foreground">Sin asignar</span>;
  const empresa = empresasById.get(user.empresa_id);
  return <span>{empresa?.nombre ?? "—"}</span>;
}

/** True when `created` won't appear in `me`'s own /usuarios list afterwards. */
function isOutOfCreatorScope(me: User | null, created: User): boolean {
  if (!me || me.acceso_todas_empresas) return false;
  return created.empresa_id !== me.empresa_id;
}

export default function Usuarios() {
  const { user: me } = useAuth();
  const empresasById = useEmpresasById();
  const [users, setUsers] = useState<User[] | null>(null);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);
  const [shownPassword, setShownPassword] = useState<{ name: string; password: string } | null>(null);
  const [outOfScopeNotice, setOutOfScopeNotice] = useState<string | null>(null);

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

  async function revealPassword(user: User) {
    try {
      const res = await apiGet<{ password: string | null }>(
        `/api/v1/usuarios/${user.id}/password`,
      );
      if (res.password) {
        setShownPassword({ name: user.full_name, password: res.password });
      } else {
        window.alert(
          "No hay contraseña guardada para mostrar. Asígnale una nueva con “Contraseña” o “Reset”; las creadas antes de esta función no se pueden recuperar.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar la contraseña");
    }
  }

  async function deleteUser(user: User) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente a ${user.full_name}?\n\nSe borrarán también todos sus partes de horas y las fotos/vídeos que haya subido. Esta acción no se puede deshacer.`,
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
                if (created && isOutOfCreatorScope(me, created)) {
                  setOutOfScopeNotice(
                    `${created.full_name} se ha creado correctamente, pero queda fuera de tu ámbito ` +
                      "actual: no te aparecerá en tu lista de usuarios a partir de ahora.",
                  );
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
              <TableHead>Empresa</TableHead>
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
                  <EmpresaLabel user={user} empresasById={empresasById} />
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
                  {user.role === "worker" ? (
                    <Button variant="outline" size="sm" onClick={() => revealPassword(user)}>
                      <Eye /> Ver
                    </Button>
                  ) : null}
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

      {/* Consult current password */}
      <Dialog
        open={shownPassword !== null}
        onOpenChange={(open) => !open && setShownPassword(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contraseña de {shownPassword?.name}</DialogTitle>
            <DialogDescription>
              Trátala con cuidado: cualquiera con ella puede entrar como este trabajador.
            </DialogDescription>
          </DialogHeader>
          {shownPassword ? (
            <div className="space-y-3 text-center">
              <p className="select-all rounded-md bg-muted p-4 font-mono text-2xl tracking-wider">
                {shownPassword.password}
              </p>
              <Button
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(shownPassword.password)}
              >
                Copiar
              </Button>
            </div>
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

      {/* Out-of-scope confirmation after creating a user the creator won't see again */}
      <Dialog
        open={outOfScopeNotice !== null}
        onOpenChange={(open) => !open && setOutOfScopeNotice(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usuario creado</DialogTitle>
            <DialogDescription>{outOfScopeNotice}</DialogDescription>
          </DialogHeader>
          <Button className="w-full" onClick={() => setOutOfScopeNotice(null)}>
            Entendido
          </Button>
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
  const { user: me } = useAuth();
  const isEdit = !!existing;
  const [username, setUsername] = useState(existing?.username ?? "");
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [trade, setTrade] = useState(existing?.trade ?? "");
  const [role, setRole] = useState<"worker" | "admin">(existing?.role ?? "worker");
  const empresasById = useEmpresasById();
  const [empresa, setEmpresa] = useState<EmpresaSlug | "todas" | "">("");
  const [empresaTouched, setEmpresaTouched] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Preselect the creator's own empresa once the lookup arrives — the map
  // starts empty (fetched async), so this can't just be the useState initial value.
  useEffect(() => {
    if (isEdit || empresaTouched || !me || me.acceso_todas_empresas || !me.empresa_id) return;
    const slug = empresasById.get(me.empresa_id)?.slug;
    if (slug) setEmpresa(slug);
  }, [empresasById, empresaTouched, isEdit, me]);

  function handleEmpresaChange(next: EmpresaSlug | "todas") {
    setEmpresa(next);
    setEmpresaTouched(true);
  }

  function handleRoleChange(next: "worker" | "admin") {
    setRole(next);
    // "todas" only makes sense for an admin
    if (next === "worker" && empresa === "todas") {
      setEmpresa("");
      setEmpresaTouched(false);
    }
  }

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
            empresa,
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
          onChange={(e) => handleRoleChange(e.target.value as "worker" | "admin")}
        >
          <option value="worker">Trabajador</option>
          <option value="admin">Administrador</option>
        </Select>
      </div>
      {isEdit ? (
        <div className="space-y-1">
          <Label>Empresa</Label>
          <p className="text-sm text-muted-foreground">
            {existing?.acceso_todas_empresas
              ? "Ambas empresas"
              : existing?.empresa_id
                ? (empresasById.get(existing.empresa_id)?.nombre ?? "—")
                : "Sin asignar"}
            {" — "}
            se cambia desde «Sin asignar» o el apartado de empresas de cada obra, no aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="f-empresa">Empresa *</Label>
          <Select
            id="f-empresa"
            value={empresa}
            onChange={(e) => handleEmpresaChange(e.target.value as EmpresaSlug | "todas")}
            required
          >
            <option value="" disabled>
              Elige una empresa
            </option>
            <option value="nido">{EMPRESA_NOMBRE.nido}</option>
            <option value="fega">{EMPRESA_NOMBRE.fega}</option>
            {role === "admin" ? <option value="todas">Ambas empresas</option> : null}
          </Select>
        </div>
      )}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={busy || (!isEdit && !empresa)}>
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
