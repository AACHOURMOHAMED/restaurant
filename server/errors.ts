export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly extra: { fields?: Record<string, string>; details?: Record<string, unknown> } = {},
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const badRequest = (code: string, message: string, fields?: Record<string, string>) =>
  new AppError(400, code, message, { fields });
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, { details });
