import { AuthenticationError, ProviderError } from '@music-downloader/shared';

const invalidResponseMessage =
  'API Яндекс Музыки изменился. Текущая версия приложения не поддерживает новый формат ответа.';
const authenticationInstruction =
  'Требуется повторная авторизация. Выполните music-downloader auth.';

/** Создаёт безопасную диагностику несовместимого ответа API; @link ../../../docs/adr/ADR-009-yandex-adapter-strategy.md */
export function invalidProviderResponse(): ProviderError {
  const error = new ProviderError('PROVIDER_RESPONSE_INVALID', false);
  error.message = invalidResponseMessage;
  return error;
}

/** Фиксирует CLI-инструкцию для отказа или отмены авторизации; @link ../../../docs/adr/ADR-010-cli-auth-and-secure-storage.md */
export function authenticationRequired(): AuthenticationError {
  const error = new AuthenticationError();
  error.message = authenticationInstruction;
  return error;
}
