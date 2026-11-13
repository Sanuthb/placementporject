import { platformRoute } from "@/lib/api/platformHandler";
import { parseQuery } from "@/lib/api/parse";
import { permissionMatrix, matrixQuery } from "@/lib/permissionMatrix";

/**
 * The read-only role and permission matrix, generated from the authorization rules in the route files (npm run docs:permissions). Platform administrators with the second step only.
 * There is no write method: roles are fixed in code and permissions cannot be edited.
 */
export const GET = platformRoute({}, async (req) => permissionMatrix(parseQuery(req, matrixQuery)));
