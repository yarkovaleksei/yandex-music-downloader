export const persistencePackage = '@music-downloader/persistence';

export * from './file-manifest-store.js';
export { SqliteManifestStore } from './sqlite-manifest-store.js';
export type { SqliteManifestStoreOptions } from './sqlite-manifest-store.js';
export type { SqliteMigration } from './sqlite-migrations.js';
export { sqliteMigrations } from './sqlite-migrations.js';
export { stateDatabaseFile } from './sqlite-database.js';
export * from './process-identity.js';
export * from './state-directory.js';

export * from './cli-credential-store.js';
export * from './cache-store.js';
export * from './file-cache-store.js';

export {
  DESKTOP_CREDENTIAL_SERVICE,
  credentialService,
} from './cli-credential-store.js';
export type { CredentialProfile } from './cli-credential-store.js';
