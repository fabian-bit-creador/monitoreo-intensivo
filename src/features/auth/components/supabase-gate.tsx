"use client";

import { ReactNode, useEffect, useState } from "react";
import { Activity, LoaderCircle } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { LoginScreen } from "./login-screen";

export type AuthSession = {
  userId: string;
  email: string;
  signOut: () => Promise<void>;
};

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

  useEffect(() => {
    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
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
        onSignIn={async (email, password) => {
          const { error } = await client.auth.signInWithPassword({ email, password });
          return error ? signInMessage(error.message) : null;
        }}
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
