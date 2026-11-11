import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";

/**
 * Loads env files the way Next.js orders them for local work: variables already in the process win, then `.env.local`, then `.env`.
 * (`dotenv/config` alone reads only `.env`, so Prisma and the scripts could miss `.env.local` and reach whatever `.env` names.)
 * Returns where each variable came from: "environment", ".env.local" or ".env". Values are never returned.
 *
 * `files` limits which files are read. Browser tests pass [".env.local"] only: a bare `.env` may name hosted projects and also carries settings
 * such as PW_BASE_URL that would silently point a test at a shared dev server.
 */
export function loadEnvFiles(dir = process.cwd(), env: Record<string, string | undefined> = process.env, files: readonly string[] = [".env.local", ".env"]): Record<string, string> {
  const source: Record<string, string> = {};
  for (const k of Object.keys(env)) source[k] = "environment";
  for (const f of files) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    for (const [k, v] of Object.entries(parse(readFileSync(p)))) {
      if (!(k in source)) { env[k] = v; source[k] = f; }
    }
  }
  return source;
}
