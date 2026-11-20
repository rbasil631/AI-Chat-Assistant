export class HttpError extends Error {
  constructor(status, message, code = undefined) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg, code) => new HttpError(400, msg, code);
export const notFound = (msg = 'Not found', code) => new HttpError(404, msg, code);
export const conflict = (msg, code) => new HttpError(409, msg, code);
export const unprocessable = (msg, code) => new HttpError(422, msg, code);
