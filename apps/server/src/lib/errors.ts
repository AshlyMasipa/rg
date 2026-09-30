import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}
export const notFound = (what: string, id: string) => new HttpError(404, "NOT_FOUND", `${what} ${id} not found`);
export const conflict = (message: string) => new HttpError(409, "CONFLICT", message);

/** Every error leaves the API as { error: { code, message, issues? } } (shared ApiError). */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: { code: "VALIDATION_FAILED", message: "Invalid request", issues: err.issues },
      });
    }
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.status(status).send({ error: { code: "BAD_REQUEST", message: (err as Error).message } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: "INTERNAL", message: "Something went wrong" } });
  });
}
