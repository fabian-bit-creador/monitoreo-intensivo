import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Pool, types, type PoolClient } from "pg";

// Las fechas (date) se leen como texto, igual que las devuelve la API de Supabase.
types.setTypeParser(1082, (value) => value);

// Base local de desarrollo: nunca la del proyecto Supabase.
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const ROOT = fileURLToPath(new URL("..", import.meta.url));

export type TestDatabase = {
  pool: Pool;
  drop: () => Promise<void>;
};

/** Crea una base vacía con la emulación de Supabase y todas las migraciones. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `monitoreo_test_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 8 });
  // Al borrar la base se cortan las conexiones inactivas: no es una falla.
  pool.on("error", () => undefined);
  await pool.query(readFileSync(join(ROOT, "tests", "supabase-stub.sql"), "utf8"));
  const migrations = readdirSync(join(ROOT, "migrations")).filter((file) => file.endsWith(".sql")).sort();
  for (const file of migrations) {
    await pool.query(readFileSync(join(ROOT, "migrations", file), "utf8"));
  }

  return {
    pool,
    drop: async () => {
      await pool.end();
      const cleanup = new Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}

/**
 * Ejecuta `task` como lo haría la API de Supabase: con el rol `authenticated`
 * y el JWT del usuario, o como `anon` si no hay usuario.
 */
export async function asUser<T>(
  pool: Pool,
  userId: string | null,
  task: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(userId ? "set local role authenticated" : "set local role anon");
    if (userId) {
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    }
    const result = await task(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Llama una función RPC como el usuario y devuelve sus filas. */
export async function rpc<T = Record<string, unknown>>(
  pool: Pool,
  userId: string | null,
  name: string,
  args: unknown[] = [],
): Promise<T[]> {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(", ");
  return asUser(pool, userId, async (client) => (await client.query(`select * from public.${name}(${placeholders})`, args)).rows as T[]);
}

/** Cuenta las filas que el usuario ve en una tabla. */
export async function visible(pool: Pool, userId: string | null, table: string, where = "true") {
  return asUser(pool, userId, async (client) => {
    const result = await client.query(`select count(*)::int as count from public.${table} where ${where}`);
    return result.rows[0].count as number;
  });
}

export async function createUser(pool: Pool, email: string) {
  const result = await pool.query(
    "insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id",
    [email],
  );
  return result.rows[0].id as string;
}

/** Espacio personal que cada cuenta recibe al crearse (ADR 0004). */
export async function personalSpaceOf(pool: Pool, userId: string) {
  const result = await pool.query("select id from public.schools where kind = 'personal' and owner_id = $1", [userId]);
  return result.rows[0].id as string;
}

/** Año académico ficticio de los cursos de prueba. */
export const ACADEMIC_YEAR = 2026;

type CreatedCourse = { courseId: string; roomTemplateId: string };

/** create_course(espacio, nombre, año, nómina, N° foco) como el usuario (ADR 0006). */
export async function createCourse(
  pool: Pool,
  userId: string | null,
  schoolId: string,
  name: string,
  entries: unknown,
  { academicYear = ACADEMIC_YEAR, focusNumbers = [] }: { academicYear?: number; focusNumbers?: number[] | null } = {},
) {
  const [row] = await rpc<{ create_course: CreatedCourse }>(pool, userId, "create_course", [
    schoolId, name, academicYear, JSON.stringify(entries), focusNumbers,
  ]);
  return row.create_course;
}
