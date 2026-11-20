export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function toApiError(res) {
  const data = await res.json().catch(() => null);
  return new ApiError(data?.error?.message ?? `Request failed (${res.status})`, res.status, data?.error?.code);
}
