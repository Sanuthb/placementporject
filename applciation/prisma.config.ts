import { defineConfig } from "prisma/config";
import { loadEnvFiles } from "./scripts/lib/envFiles";
import { assertLocalTargets } from "./lib/localOnly";

// Same order Next.js uses for local work: real environment, then .env.local, then .env (dotenv/config alone would read only .env).
loadEnvFiles();

const url = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];
// Commands that open a database connection are refused unless the target is the isolated local stack. `prisma generate` and `validate` never connect, so builds are unaffected.
// A deliberate, approved operation against anything else needs ALLOW_REMOTE_DB=I_UNDERSTAND_THIS_IS_NOT_LOCAL (see docs/LOCAL_ENV.md).
if (process.argv.some((a) => ["migrate", "db", "studio"].includes(a))) assertLocalTargets({ DIRECT_URL: url }, { what: "run a Prisma database command" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Migrations need the direct (non-pooled) connection.
    url,
  },
});
