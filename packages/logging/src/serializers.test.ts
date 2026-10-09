import { describe, expect, it } from 'vitest';
import { createRedactor } from './redactor.js';
import { serializeCliRecord, serializeError } from './serializers.js';

const token = 'known-token-456';
const signedUrl = `https://cdn.example.test/file?token=${token}`;

describe('serializers', () => {
  it('не переносит cause, stack и секреты в DTO ошибки', () => {
    const serialized = serializeError(
      new Error(`Authorization: Bearer ${token} ${signedUrl}`),
    );

    expect(serialized).toMatchObject({
      code: 'DOWNLOAD_ERROR',
      retryable: false,
    });
    expect(JSON.stringify(serialized)).not.toContain(token);
    expect(serialized).not.toHaveProperty('cause');
    expect(serialized).not.toHaveProperty('stack');
  });

  it('очищает CliRecord тем же redactor', () => {
    const redactor = createRedactor();
    redactor.registerField('sessionSecret');
    const output = serializeCliRecord(
      {
        schemaVersion: 1,
        kind: 'result',
        command: 'doctor',
        data: { url: signedUrl, sessionSecret: token },
      },
      redactor,
    );

    expect(output).not.toContain(token);
    expect(output).not.toContain('?token');
  });
});
