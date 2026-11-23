import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from './firebaseIds.js';

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;

interface FirestoreValue {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string | number;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

function decodeFirestoreValue(val: FirestoreValue | undefined): unknown {
  if (!val) return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('arrayValue' in val) {
    const items = val.arrayValue?.values ?? [];
    return items.map((item) => decodeFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function decodeDocumentFields(fields: Record<string, FirestoreValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields) return out;
  for (const [key, value] of Object.entries(fields)) {
    out[key] = decodeFirestoreValue(value);
  }
  return out;
}

export async function getDocument<T = Record<string, unknown>>(
  docPath: string,
  idToken: string
): Promise<T | null> {
  const cleanPath = docPath.replace(/^\/+/, '');
  const res = await fetch(`${BASE_URL}/${cleanPath}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const err = new Error(`Firestore read failed (${res.status})`);
    (err as Error & { statusCode?: number; code?: string }).statusCode = res.status;
    (err as Error & { statusCode?: number; code?: string }).code =
      res.status === 403 ? 'FIRESTORE_PERMISSION_DENIED' : 'FIRESTORE_ERROR';
    throw err;
  }

  const json = (await res.json()) as { fields?: Record<string, FirestoreValue> };
  return decodeDocumentFields(json.fields) as T;
}

export interface RunQueryRow<T = Record<string, unknown>> {
  id: string;
  path: string;
  data: T;
}

export async function runQuery<T = Record<string, unknown>>(
  parentPath: string,
  structuredQuery: Record<string, unknown>,
  idToken: string
): Promise<RunQueryRow<T>[]> {
  const cleanParent = parentPath.replace(/^\/+|\/+$/g, '');
  const url = cleanParent
    ? `${BASE_URL}/${cleanParent}:runQuery`
    : `${BASE_URL}:runQuery`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ structuredQuery }),
  });

  if (!res.ok) {
    const err = new Error(`Firestore query failed (${res.status})`);
    (err as Error & { statusCode?: number; code?: string }).statusCode = res.status;
    (err as Error & { statusCode?: number; code?: string }).code =
      res.status === 403 ? 'FIRESTORE_PERMISSION_DENIED' : 'FIRESTORE_ERROR';
    throw err;
  }

  const rows = (await res.json()) as Array<{
    document?: {
      name: string;
      fields?: Record<string, FirestoreValue>;
    };
  }>;

  const out: RunQueryRow<T>[] = [];
  for (const row of rows) {
    if (!row.document) continue;
    const fullName = row.document.name;
    const marker = '/documents/';
    const idx = fullName.indexOf(marker);
    const relPath = idx >= 0 ? fullName.slice(idx + marker.length) : fullName;
    const parts = relPath.split('/');
    const id = parts[parts.length - 1] || '';
    out.push({
      id,
      path: relPath,
      data: decodeDocumentFields(row.document.fields) as T,
    });
  }
  return out;
}
