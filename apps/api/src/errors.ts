export class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what);
export const forbidden = (message = 'Not allowed') => new HttpError(403, message);
export const unauthorized = () => new HttpError(401, 'Sign in first');
export const conflict = (message: string) => new HttpError(409, message);
export const badRequest = (message: string) => new HttpError(400, message);
