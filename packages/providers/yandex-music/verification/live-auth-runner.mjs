/** Ручной live flow без сериализации credentials; @link ../../../planning/tasks/STEP-008.md */
import { YandexMusicProviderAuth } from '../dist/index.js';

export async function runLiveAuth(credentialStore) {
  const stages = [];
  const provider = new YandexMusicProviderAuth({
    credentialStore,
    authInteraction: {
      notify: () => {
        stages.push('browser-opened');
      },
    },
  });
  await provider.authenticate();
  stages.push('authenticated');
  await provider.getAccount();
  stages.push('account-confirmed');
  await provider.logout();
  if (await provider.getAccount()) throw new Error('logout-state-invalid');
  stages.push('logout-confirmed');
  return stages;
}
