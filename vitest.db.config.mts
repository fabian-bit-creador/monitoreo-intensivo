import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pruebas de la base de datos (RLS y funciones) sobre un PostgreSQL local.
// Requieren TEST_DATABASE_URL o un servidor en 127.0.0.1:54329.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["supabase/tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
