/**
 * Recognises "the database cannot be reached" (refused, reset, timed out, shutting down, pool exhausted) as opposed to a bug or bad data, so the API can answer
 * 503 with a plain message instead of a generic 500. It looks at the error, its cause chain, Prisma's connection codes and the driver's wording, and it never returns
 * any detail from the error itself.
 */
const CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN", "57P01", "57P02", "57P03", "08000", "08003", "08006", "53300"]);
const WORDS = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|Connection terminated|connection timeout|timeout exceeded when trying to connect|terminating connection|database system is (starting up|shutting down)|Can't reach database server|server has closed the connection|Connection refused|too many clients/i;
export function isDatabaseUnavailable(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && typeof x === "object" && i < 5; x = (x as { cause?: unknown }).cause, i++) {
    const o = x as { code?: unknown; name?: unknown; message?: unknown; errors?: unknown[] };
    if (typeof o.code === "string" && CODES.has(o.code)) return true;
    if (o.name === "PrismaClientInitializationError") return true;
    if (typeof o.message === "string" && WORDS.test(o.message)) return true;
    if (Array.isArray(o.errors) && o.errors.some((y) => isDatabaseUnavailable(y))) return true; // AggregateError (one entry per address tried)
  }
  return false;
}
