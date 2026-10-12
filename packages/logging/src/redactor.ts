import type { JsonObject, JsonValue } from '@music-downloader/shared';

const defaultSecretFields = [
  'authorization',
  'cookie',
  'token',
  'accesstoken',
  'access_token',
  'credentials',
  'password',
  'clientsecret',
  'client_secret',
  'streamkey',
  'decryptionkey',
  'challenge',
  'authchallenge',
  'devicecode',
  'usercode',
  'verificationuri',
];

const redacted = '[REDACTED]';

export interface RedactorOptions {
  readonly secretFields?: readonly string[];
  readonly secretValues?: readonly string[];
}

export interface Redactor {
  registerField(name: string): void;
  registerSecret(value: string): void;
  redact(value: unknown): JsonValue;
}

/**
 * Централизованная редакция из REQ-039 работает только с известными или явно
 * зарегистрированными полями и значениями; неизвестные секреты не распознаются.
 */
export function createRedactor(options: RedactorOptions = {}): Redactor {
  const fields = new Set(defaultSecretFields.map(normalizeField));
  const values = new Set<string>();
  options.secretFields?.forEach((field) => fields.add(normalizeField(field)));
  options.secretValues?.forEach((value) => addSecret(value));

  function addSecret(value: string): void {
    const normalized = value.trim();
    if (normalized) values.add(normalized);
  }

  function redact(value: unknown): JsonValue {
    return sanitize(value, fields, values);
  }

  return {
    registerField(name) {
      fields.add(normalizeField(name));
    },
    registerSecret: addSecret,
    redact,
  };
}

function sanitize(
  value: unknown,
  fields: ReadonlySet<string>,
  values: ReadonlySet<string>,
): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return value;
  if (typeof value === 'string') return sanitizeString(value, values);
  if (Array.isArray(value))
    return value.map((item) => sanitize(item, fields, values));
  if (typeof value !== 'object') return String(value);

  const result: Record<string, JsonValue> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (nested === undefined) continue;
    result[key] = fields.has(normalizeField(key))
      ? redacted
      : sanitize(nested, fields, values);
  }
  return result as JsonObject;
}

function normalizeField(name: string): string {
  return name.toLocaleLowerCase();
}

function sanitizeString(value: string, values: ReadonlySet<string>): string {
  let cleaned = value.replace(/https?:\/\/[^\s"']+/giu, sanitizeUrl);
  for (const secret of values) cleaned = cleaned.split(secret).join(redacted);
  return cleaned;
}

function sanitizeUrl(candidate: string): string {
  try {
    const url = new URL(candidate);
    url.username = '';
    url.password = '';
    url.search = '';
    return url.toString();
  } catch {
    return candidate;
  }
}
