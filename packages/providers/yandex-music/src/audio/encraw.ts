import { encrawDecipher } from '@dvxch/yandex-music';
import { abortError } from './transport.js';

/** Мостит разрешённый SDK decipher в Web stream без полного буферизования.
 * @link ../../../../../docs/architecture-decisions/ADR-009-yandex-adapter-strategy.md
 */
export function decryptEncrawStream(
  source: ReadableStream<Uint8Array>,
  key: string,
  signal: AbortSignal,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const decipher = encrawDecipher(key);
  return new ReadableStream({
    async pull(controller) {
      if (signal.aborted) {
        await reader.cancel();
        decipher.destroy();
        controller.error(abortError());
        return;
      }
      try {
        const item = await reader.read();
        if (item.done) {
          const tail = decipher.final();
          if (tail.byteLength) controller.enqueue(new Uint8Array(tail));
          controller.close();
          return;
        }
        const plain = decipher.update(Buffer.from(item.value));
        if (plain.byteLength) controller.enqueue(new Uint8Array(plain));
      } catch (error) {
        decipher.destroy();
        controller.error(error);
      }
    },
    async cancel() {
      decipher.destroy();
      await reader.cancel();
    },
  });
}
