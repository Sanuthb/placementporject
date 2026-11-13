import type { Instrumentation } from "next";

/** Runs once when a server instance starts: refuse to boot in production with broken configuration. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkEnv } = await import("@/lib/env");
  const { errors, warnings } = checkEnv();
  for (const w of warnings) console.warn(JSON.stringify({ level: "warn", msg: w }));
  if (errors.length) {
    const msg = `Invalid configuration:\n  - ${errors.join("\n  - ")}`;
    if (process.env.NODE_ENV === "production") throw new Error(msg);
    console.error(JSON.stringify({ level: "error", msg }));
  }
}

/** Unhandled errors (outside the API wrapper) end up in the logs as one JSON line each. */
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  // The monitoring store reaches the database client, which needs Node.js APIs; skip it in the edge runtime (this check also keeps it out of the edge bundle).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError, safeFailure } = await import("@/lib/monitorStore");
  const h = request.headers?.["x-request-id"]; recordError({ status: 500, code: "UNHANDLED", message: safeFailure(err), method: request.method, path: request.path, requestId: Array.isArray(h) ? h[0] : h ?? null });
  console.error(JSON.stringify({ level: "error", path: request.path, method: request.method, message: (err as Error)?.message, digest: (err as { digest?: string })?.digest }));
};
