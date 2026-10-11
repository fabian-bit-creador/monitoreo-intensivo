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
  client ??= createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}
