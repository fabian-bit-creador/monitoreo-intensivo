import { FormEvent, ReactNode, useState } from "react";
import { AlertTriangle, LoaderCircle, LogIn } from "lucide-react";
import { BrandLockup } from "@/components/layout/brand";

type LoginScreenProps = {
  /** Devuelve un mensaje de error, o null si ingresó. */
  onSignIn: (email: string, password: string) => Promise<string | null>;
  /** Solo si Google está activo en Supabase. Devuelve un error, o null si redirige. */
  onGoogle?: () => Promise<string | null>;
  initialError?: string;
  /** Aviso bajo el formulario, por ejemplo, datos guardados sin cuenta. */
  notice?: ReactNode;
};

/** Logo de Google para el botón de ingreso, según su guía de marca. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function LoginScreen({ onSignIn, onGoogle, initialError = "", notice }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
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
        <BrandLockup />
        <div>
          <h1>Ingresar</h1>
          <p>
            {onGoogle
              ? "Entra con tu cuenta de Google y crea tus cursos, o usa la cuenta que te entregó tu establecimiento."
              : "Usa la cuenta que te entregó tu establecimiento. Tus clases y registros quedan asociados a ella."}
          </p>
        </div>
        {onGoogle ? (
          <>
            <button
              type="button"
              className="secondary-button wide google-button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void onGoogle().then((message) => {
                  // Si no hay error, el navegador ya va camino a Google.
                  if (message) {
                    setError(message);
                    setBusy(false);
                  }
                });
              }}
            >
              <GoogleMark /> Continuar con Google
            </button>
            <div className="login-divider"><span>o con correo y contraseña</span></div>
          </>
        ) : null}
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
      {notice}
    </div>
  );
}
