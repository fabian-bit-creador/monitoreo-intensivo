import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Configuración pública de Supabase. La clave publicable puede estar en el
 * navegador: los permisos los aplica RLS. Nunca se usa la clave service_role.
 */
export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return process.env.NEXT_PUBLIC_DATA_MODE === "supabase" && url && key ? { url, key } : null;
}

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase no está configurado.");
  // PKCE: al volver de Google, la sesión llega como ?code= y se canjea aquí.
  client ??= createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  return client;
}

/**
 * Proveedores activos en Supabase Auth. El botón de Google solo aparece si
 * el dueño del proyecto lo configuró (ADR 0004).
 */
export async function enabledAuthProviders(): Promise<{ google: boolean }> {
  const config = supabaseConfig();
  if (!config) return { google: false };
  try {
    const response = await fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.key } });
    if (!response.ok) return { google: false };
    const settings = await response.json() as { external?: Record<string, boolean> };
    return { google: settings.external?.google === true };
  } catch {
    return { google: false };
  }
}
