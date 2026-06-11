import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ErrorMessage, Field, Input } from "../components/ui";
import { useAuth } from "../lib/auth-context";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = await login(username.trim(), password);
      navigate(user.must_change_password ? "/cambiar-password" : "/", {
        replace: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-100 p-6">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 rounded-2xl bg-ink-800 px-6 py-5 shadow-sm">
            <img
              src="/brand/logo.png"
              alt="Nido Constructions"
              className="h-10 w-auto"
            />
          </div>
          <p className="text-gray-500">Partes de obra · Acceso de trabajadores</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Usuario">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
          </Field>
          <Field label="Contraseña">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" disabled={busy}>
            {busy ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
