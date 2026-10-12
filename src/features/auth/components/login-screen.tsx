import { FormEvent, useState } from "react";
import { Activity, AlertTriangle, LoaderCircle, LogIn } from "lucide-react";
import { APP_NAME, APP_SUBTITLE } from "@/config/app";

type LoginScreenProps = {
  /** Devuelve un mensaje de error, o null si ingresó. */
  onSignIn: (email: string, password: string) => Promise<string | null>;
};

export function LoginScreen({ onSignIn }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const message = await onSignIn(email.trim(), password);
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <div className="loading-screen login-screen">
      <form className="card login-card form-stack" onSubmit={(event) => void submit(event)}>
        <div className="brand-lockup">
          <div className="brand-mark"><Activity size={21} /></div>
          <div>
            <strong>{APP_NAME}</strong>
            <span>{APP_SUBTITLE}</span>
          </div>
        </div>
        <div>
          <h1>Ingresar</h1>
          <p>Usa la cuenta que te entregó tu establecimiento. Tus clases y registros quedan asociados a ella.</p>
        </div>
        <label>
          <span>Correo</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? (
          <div className="error-banner" role="alert"><AlertTriangle size={17} /> {error}</div>
        ) : null}
        <button className="primary-button wide" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />}
          Ingresar
        </button>
        <p className="login-note">¿Olvidaste tu contraseña? Pide a administración que la restablezca.</p>
      </form>
    </div>
  );
}
