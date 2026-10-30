import { describe, expect, it } from 'vitest';
import { createRedactor } from './redactor.js';

const token = 'known-token-123';
const cookieCanary = 'cookie-canary-456';
const signedUrl = `https://user:pass@cdn.example.test/audio?signature=${token}&expires=42`;

describe('createRedactor', () => {
  it('очищает известные поля, зарегистрированное поле и signed URL во вложенном JSON', () => {
    const redactor = createRedactor();
    redactor.registerField('ProviderCredential');
    const cleaned = redactor.redact({
      Authorization: `Bearer ${token}`,
      CoOkIe: cookieCanary,
      nested: [{ token }, { url: signedUrl }],
      ProviderCredential: token,
    });
    const output = JSON.stringify(cleaned);

    expect(output).not.toContain(token);
    expect(output).not.toContain(cookieCanary);
    expect(output).not.toContain('signature');
    expect(output).toContain('https://cdn.example.test/audio');
    expect(cleaned).toMatchObject({
      Authorization: '[REDACTED]',
      CoOkIe: '[REDACTED]',
      ProviderCredential: '[REDACTED]',
    });
  });

  it('очищает явно зарегистрированное значение внутри строки', () => {
    const redactor = createRedactor();
    redactor.registerSecret(token);

    expect(JSON.stringify(redactor.redact(`получен ${token}`))).not.toContain(
      token,
    );
  });
});
