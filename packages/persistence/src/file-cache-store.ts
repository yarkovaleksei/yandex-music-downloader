import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { readJsonIfPresent, writeAtomicJson } from './atomic-json.js';
import type { CacheKey, CacheStore } from './cache-store.js';

interface CacheEnvelope {
  readonly version: 1;
  readonly expiresAt: number;
  readonly payload: unknown;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function cacheFile(root: string, key: CacheKey): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        key.providerId,
        key.accountId,
        key.schemaVersion,
        key.method,
        key.arguments,
      ]),
    )
    .digest('hex');
  return path.join(root, `${digest}.json`);
}

/**
 * Файлы cache отделены от manifest и artwork snapshot, поэтому clear не влияет на recovery.
 * docs/requirements/REQ-027-meta-cache.md
 */
export class FileCacheStore implements CacheStore {
  private readonly directory: string;
  private readonly now: () => number;
  private readonly ttlMs: number;

  public constructor(options: {
    readonly stateDir: string;
    readonly ttlMs: number;
    readonly now?: () => number;
  }) {
    this.directory = path.join(options.stateDir, 'cache');
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
  }

  public async read(key: CacheKey): Promise<string | undefined> {
    try {
      const raw = await readJsonIfPresent(cacheFile(this.directory, key));
      if (raw === undefined) return undefined;
      const envelope = record(JSON.parse(raw));
      if (
        envelope?.version !== 1 ||
        typeof envelope.expiresAt !== 'number' ||
        !Number.isFinite(envelope.expiresAt) ||
        this.now() >= envelope.expiresAt ||
        envelope.payload === undefined
      )
        return undefined;
      return JSON.stringify(envelope.payload);
    } catch {
      // Повреждённый или недоступный cache не меняет результат provider-запроса.
      return undefined;
    }
  }

  public async write(key: CacheKey, payload: string): Promise<void> {
    const value = JSON.parse(payload) as unknown;
    const envelope: CacheEnvelope = {
      version: 1,
      expiresAt: this.now() + this.ttlMs,
      payload: value,
    };
    await writeAtomicJson(
      cacheFile(this.directory, key),
      JSON.stringify(envelope),
    );
  }

  public async clear(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true });
  }
}
