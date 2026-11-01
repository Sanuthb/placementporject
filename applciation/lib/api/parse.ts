import type { NextRequest } from "next/server";
import type { z } from "zod";
import { ApiError, badRequest } from "@/lib/api/errors";

const tooLarge = (max: number) => new ApiError(413, "PAYLOAD_TOO_LARGE", `The request is larger than ${Math.round(max / 1024)} KB`);
export const JSON_LIMIT = 1_000_000;

export async function parseBody<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  if (Number(req.headers.get("content-length") ?? 0) > JSON_LIMIT) throw tooLarge(JSON_LIMIT); // refuse before reading it
  // An empty body is handed to the schema as undefined, so schemas with a default accept it.
  const text = await req.text();
  if (text.length > JSON_LIMIT) throw tooLarge(JSON_LIMIT);
  let json: unknown;
  try {
    json = text.trim() === "" ? undefined : JSON.parse(text);
  } catch {
    throw badRequest("Body must be valid JSON");
  }
  return schema.parse(json);
}

export function parseQuery<T extends z.ZodType>(req: NextRequest, schema: T): z.infer<T> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

/**
 * Reads a multipart upload, refusing oversized requests from their Content-Length before the body is buffered.
 * `maxFileBytes` is the largest file the route accepts; a little headroom covers the multipart framing.
 */
export async function readForm(req: NextRequest, maxFileBytes: number) {
  const max = maxFileBytes + 64 * 1024;
  if (Number(req.headers.get("content-length") ?? 0) > max) throw new ApiError(413, "PAYLOAD_TOO_LARGE", `Uploads can be at most ${Math.round(maxFileBytes / 1048576)} MB`);
  try {
    return await req.formData();
  } catch {
    throw badRequest("Send the file as multipart/form-data");
  }
}
