import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ErrorMessage, Field, Input } from "../components/ui";
import { apiSend } from "../lib/api";
import { useAuth } from "../lib/auth-context";

export default function CambiarPassword() {
  const { updateUser } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (next.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (next !== repeat) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setBusy(true);
    try {
      await apiSend("POST", "/api/v1/auth/change-password", {
        current_password: current,
        new_password: next,
      });
      updateUser({ must_change_password: false });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-100 p-6">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Nueva contraseña</h1>
        <p className="mb-6 text-gray-600">
          Por seguridad, cambia la contraseña antes de continuar.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Contraseña actual">
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Field label="Nueva contraseña">
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="Repite la nueva contraseña">
            <Input
              type="password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" disabled={busy}>
            {busy ? "Guardando..." : "Guardar y continuar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
