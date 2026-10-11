"use client";

import { ReactNode, useEffect, useState } from "react";
import { Activity, LoaderCircle } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { enabledAuthProviders, getSupabaseClient } from "@/lib/supabase";
import { LoginScreen } from "./login-screen";

export type AuthSession = {
  userId: string;
  email: string;
  signOut: () => Promise<void>;
};

/** Al volver de Google con un error, Supabase lo deja en la dirección. */
function readReturnError() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
  const description = params.get("error_description") ?? params.get("error");
  return description ? `No fue posible ingresar con Google: ${description}` : "";
}

/** Quita ?code= y los errores de la dirección después de procesarlos. */
function cleanReturnUrl() {
  const url = new URL(window.location.href);
  const keys = ["code", "error", "error_code", "error_description", "state"];
  if (!keys.some((key) => url.searchParams.has(key)) && !url.hash.includes("error")) return;
  keys.forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  window.history.replaceState(null, "", url.toString());
}

function signInMessage(message: string) {
  if (/invalid login credentials/i.test(message)) return "Correo o contraseña incorrectos.";
  if (/email not confirmed/i.test(message)) return "Confirma tu correo antes de ingresar.";
  if (/fetch|network/i.test(message)) return "No hay conexión con el servidor. Inténtalo de nuevo.";
  return "No fue posible ingresar. Inténtalo de nuevo.";
}

/**
 * Pide iniciar sesión con Supabase Auth y entrega la sesión a la aplicación.
 * La autoría de clases y registros sale de esta cuenta, no de un selector.
 */
export function SupabaseGate({ children }: { children: (session: AuthSession) => ReactNode }) {
  const [client] = useState(getSupabaseClient);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [google, setGoogle] = useState(false);
  const [returnError] = useState(readReturnError);

  useEffect(() => {
    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      cleanReturnUrl();
    });
    enabledAuthProviders().then((providers) => {
      if (active) setGoogle(providers.google);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  if (session === undefined) {
    return (
      <div className="loading-screen">
        <div className="brand-mark"><Activity size={26} /></div>
        <LoaderCircle className="spin" size={24} />
        <p>Verificando tu sesión…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        initialError={returnError}
        onSignIn={async (email, password) => {
          const { error } = await client.auth.signInWithPassword({ email, password });
          return error ? signInMessage(error.message) : null;
        }}
        onGoogle={google ? async () => {
          const { error } = await client.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${window.location.origin}${window.location.pathname}`,
              queryParams: { prompt: "select_account" },
            },
          });
          return error ? signInMessage(error.message) : null;
        } : undefined}
      />
    );
  }

  return children({
    userId: session.user.id,
    email: session.user.email ?? "",
    signOut: async () => {
      await client.auth.signOut();
    },
  });
}
