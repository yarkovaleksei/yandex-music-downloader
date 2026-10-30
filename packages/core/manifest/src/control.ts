import type {
  ControlReceipt,
  ControlRequest,
  LeaseSession,
} from '@music-downloader/shared';
/** Единственный owner применяет inbox команды; session публикует ack после commit. */
export async function consumeManifestControls(
  session: LeaseSession,
  apply: (request: ControlRequest) => Promise<ControlReceipt>,
): Promise<readonly ControlReceipt[]> {
  return session.consumeControls(apply);
}
