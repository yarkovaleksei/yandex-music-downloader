import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
} from 'node:crypto';

/** @link docs/architecture-decisions/ADR-019-portable-distribution-and-updates.md Приватный ключ остаётся в отдельной записи системного хранилища. */
export function initializeKey(entry) {
  let pem = entry.getPassword();
  if (!pem) {
    const pair = generateKeyPairSync('ed25519');
    pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    entry.setPassword(pem);
  }
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Неподходящий ключ');
  return createPublicKey(key)
    .export({ type: 'spki', format: 'pem' })
    .toString();
}
export function signDescriptor(entry, bytes) {
  const pem = entry.getPassword();
  if (!pem) throw new Error('Ключ не настроен');
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Неподходящий ключ');
  return sign(null, bytes, key);
}
