export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = (m = "Authentication required") => new ApiError(401, "UNAUTHORIZED", m);
export const forbidden = (m = "You do not have access to this resource") => new ApiError(403, "FORBIDDEN", m);
export const notFound = (m = "Not found") => new ApiError(404, "NOT_FOUND", m);
export const badRequest = (m: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", m, details);
