/** Безопасное состояние обновления: без URL, путей и ключей. */
export interface UpdateView {
  readonly status: 'disabled' | 'current' | 'available' | 'ready' | 'error';
  readonly currentVersion: string;
  readonly version?: string;
  readonly message: string;
}
