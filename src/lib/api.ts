export class ApiRequestError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = 'API_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(
  url: string,
  idToken: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
  } = {}
): Promise<T> {
  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }

  if (res.status === 502 || res.status === 504 || json === null) {
    throw new ApiRequestError(
      'The server is busy. Click Retry.',
      res.status || 503,
      'SERVER_BUSY'
    );
  }

  if (!res.ok) {
    const errMsg =
      typeof json.error === 'string' && json.error.trim()
        ? json.error
        : 'Request failed. Please try again.';
    const errCode = typeof json.code === 'string' ? json.code : 'API_ERROR';
    throw new ApiRequestError(errMsg, res.status, errCode);
  }

  return json as T;
}
