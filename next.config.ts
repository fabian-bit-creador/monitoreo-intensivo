import type { NextConfig } from "next";

// Producción usa el proyecto oficial incluso si Vercel todavía no tiene las
// variables configuradas. Estos dos valores son públicos por diseño; RLS
// mantiene la autorización y nunca se incorpora una clave service_role.
if (process.env.VERCEL_ENV === "production") {
  process.env.NEXT_PUBLIC_DATA_MODE ??= "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://kuqrulqfmpchmmjfellf.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "sb_publishable__0XfaSDNqKnl92LWTNdoJQ_TgdBH3qL";
}

/**
 * Orígenes a los que la página puede conectarse. Solo se agrega Supabase
 * cuando la compilación lo usa (NEXT_PUBLIC_SUPABASE_URL).
 */
function connectSources() {
  const sources = ["'self'"];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) sources.push(new URL(supabaseUrl).origin);
  return sources.join(" ");
}

/**
 * La página es estática: Next.js agrega scripts en línea que no pueden llevar
 * nonce, por eso script-src permite 'unsafe-inline'. Aun así, ningún script ni
 * conexión puede venir de otro dominio, y la página no se puede incrustar.
 * En desarrollo, Next.js necesita además 'unsafe-eval'.
 */
function contentSecurityPolicy() {
  const scripts = ["'self'", "'unsafe-inline'"];
  if (process.env.NODE_ENV === "development") scripts.push("'unsafe-eval'");
  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources()}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` no debe agregar su bloque a AGENTS.md: ese archivo lo escribe el
  // equipo y cualquier cambio pasa por revisión.
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

