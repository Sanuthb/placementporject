import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who an AI call is for, without passing it through every feature. The API wrappers (staff, student, recruiter) run each handler inside `runWithAiContext(collegeId, ...)`, so the AI layer
 * can count usage and apply limits per institution. A call made outside any request (a script, a job) belongs to "platform". Only an institution id is held: no user, prompt or content.
 */
const store = new AsyncLocalStorage<{ collegeId: string | null }>();
export const runWithAiContext = <T>(collegeId: string | null | undefined, fn: () => T): T => store.run({ collegeId: collegeId ?? null }, fn);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The college id for counting, or "platform". Anything that is not a UUID counts as "platform", so nothing odd can reach a key or a query. */
export const currentCollegeKey = (): string => { const c = store.getStore()?.collegeId; return c && UUID.test(c) ? c.toLowerCase() : "platform"; };
