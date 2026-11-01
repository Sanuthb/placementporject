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
  console.error(JSON.stringify({ level: "error", path: request.path, method: request.method, message: (err as Error)?.message, digest: (err as { digest?: string })?.digest }));
};
