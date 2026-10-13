/** Составной ключ остаётся только входом для хеша и не записывается в cache envelope. */
export interface CacheKey {
  readonly providerId: string;
  readonly accountId: string;
  readonly schemaVersion: string;
  readonly method: string;
  readonly arguments: readonly string[];
}

/** Cache хранит только сериализованный JSON payload, подготовленный application allowlist. */
export interface CacheStore {
  read(key: CacheKey): Promise<string | undefined>;
  write(key: CacheKey, payload: string): Promise<void>;
  clear(): Promise<void>;
}
