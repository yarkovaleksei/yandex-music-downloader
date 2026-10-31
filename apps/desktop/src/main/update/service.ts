import type { UpdateView } from '../../contract/update.js';
export type { UpdateView } from '../../contract/update.js';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
const version = z.string().max(128).regex(versionPattern);
export const descriptorSchema = z.strictObject({
  schemaVersion: z.literal(1),
  version,
  channel: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  target: z.enum(['linux-x64', 'win32-x64', 'darwin-arm64', 'darwin-x64']),
  url: z.string().url().max(4096),
  size: z.number().int().positive().max(2_147_483_648),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type Descriptor = z.infer<typeof descriptorSchema>;
export interface UpdateTrust {
  readonly feedBaseUrl: string | null;
  readonly publicKey: string | null;
  readonly origins: readonly string[];
  readonly channel: string;
}
/** Полный порядок SemVer без build metadata; stable старше prerelease той же версии. */
export function newer(candidate: string, current: string): boolean {
  const a = versionPattern.exec(version.parse(candidate))!;
  const b = versionPattern.exec(version.parse(current))!;
  for (let index = 1; index <= 3; index++) {
    const left = BigInt(a[index]!);
    const right = BigInt(b[index]!);
    if (left !== right) return left > right;
  }
  if (!a[4] || !b[4]) return Boolean(!a[4] && b[4]);
  const left = a[4].split('.');
  const right = b[4].split('.');
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const x = left[index];
    const y = right[index];
    if (x === undefined || y === undefined) return x !== undefined;
    if (x === y) continue;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    return xn && yn ? BigInt(x) > BigInt(y) : xn !== yn ? !xn : x > y;
  }
  return false;
}
const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
function allowedUrl(value: string, trust: UpdateTrust): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    !trust.origins.includes(url.origin)
  )
    throw new Error('UPDATE_ORIGIN');
  return url;
}
/** Reader освобождается и при отказе проверки: незавершённый ответ не остаётся читать фоновые байты. */
async function* chunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) return;
      yield item.value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
async function bounded(response: Response, maximum: number): Promise<Buffer> {
  if (!response.ok || !response.body) throw new Error('UPDATE_HTTP');
  const pieces: Uint8Array[] = [];
  let size = 0;
  for await (const piece of chunks(response.body)) {
    size += piece.length;
    if (size > maximum) throw new Error('UPDATE_SIZE');
    pieces.push(piece);
  }
  return Buffer.concat(pieces);
}
/** @link docs/architecture-decisions/ADR-019-portable-distribution-and-updates.md Только main принимает решения о доверии пакету. */
export class PortableUpdates {
  private selected?: Readonly<Descriptor>;
  private readyFile?: string;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly trust: UpdateTrust;
  public constructor(
    private readonly options: {
      readonly trust: UpdateTrust;
      readonly currentVersion: string;
      readonly target: string;
      readonly directory: string;
      readonly fetch?: typeof fetch;
      readonly reveal: (file: string) => void | Promise<void>;
    },
  ) {
    // Копия не даёт изменённому config/feed заменить уже принятое решение о доверии.
    this.trust = Object.freeze({
      ...options.trust,
      origins: Object.freeze([...options.trust.origins]),
    });
  }
  private view(status: UpdateView['status'], message: string): UpdateView {
    return {
      status,
      currentVersion: this.options.currentVersion,
      ...(this.selected ? { version: this.selected.version } : {}),
      message,
    };
  }
  private serial(action: () => Promise<UpdateView>): Promise<UpdateView> {
    const result = this.queue
      .then(action)
      .catch(() =>
        this.view(
          'error',
          'Не удалось проверить обновление. Текущая версия и ваши данные сохранены.',
        ),
      );
    this.queue = result;
    return result;
  }
  private async request(value: string): Promise<Response> {
    let url = allowedUrl(value, this.trust);
    for (let count = 0; count <= 5; count++) {
      const response = await (this.options.fetch ?? fetch)(url.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(60_000),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('UPDATE_REDIRECT');
      url = allowedUrl(new URL(location, url).href, this.trust);
    }
    throw new Error('UPDATE_REDIRECT');
  }
  public check(): Promise<UpdateView> {
    return this.serial(async () => {
      this.selected = undefined;
      this.readyFile = undefined;
      if (!this.trust.publicKey || !this.trust.feedBaseUrl)
        return this.view(
          'disabled',
          'Обновления пока не настроены. Используйте portable-пакет от автора приложения.',
        );
      const key = createPublicKey(this.trust.publicKey);
      if (key.asymmetricKeyType !== 'ed25519') throw new Error('UPDATE_KEY');
      // GitHub хранит assets плоско; прежние HTTPS feeds сохраняют вложенный путь.
      const feed = new URL(this.trust.feedBaseUrl);
      const github =
        feed.origin === 'https://github.com' &&
        /^\/[^/]+\/[^/]+\/releases\/latest\/download\/?$/.test(feed.pathname);
      const endpoint = new URL(
        github
          ? `update-${this.trust.channel}-${this.options.target}.json`
          : `${this.trust.channel}/${this.options.target}/latest.json`,
        this.trust.feedBaseUrl.endsWith('/')
          ? this.trust.feedBaseUrl
          : this.trust.feedBaseUrl + '/',
      ).href;
      const bytes = await bounded(await this.request(endpoint), 65_536);
      const signature = await bounded(
        await this.request(endpoint + '.sig'),
        64,
      );
      // Доверяем JSON только после проверки подписи точных полученных байтов.
      if (signature.length !== 64 || !verify(null, bytes, key, signature))
        throw new Error('UPDATE_SIGNATURE');
      const descriptor = descriptorSchema.parse(
        JSON.parse(bytes.toString('utf8')),
      );
      if (
        descriptor.channel !== this.trust.channel ||
        descriptor.target !== this.options.target ||
        (this.trust.channel === 'stable' && descriptor.version.includes('-'))
      )
        throw new Error('UPDATE_TARGET');
      const packageUrl = allowedUrl(descriptor.url, this.trust);
      // Пакет привязан к подписанной версии, а latest выбирает только описание.
      if (
        github &&
        (packageUrl.origin !== feed.origin ||
          !packageUrl.pathname.startsWith(
            feed.pathname.replace(
              /latest\/download\/?$/,
              `download/v${descriptor.version}/`,
            ),
          ) ||
          packageUrl.search)
      )
        throw new Error('UPDATE_RELEASE');
      if (!newer(descriptor.version, this.options.currentVersion))
        return this.view('current', 'У вас актуальная версия приложения.');
      this.selected = Object.freeze(descriptor);
      return this.view(
        'available',
        'Доступна новая версия. Пакет будет скачан только по вашей команде.',
      );
    });
  }
  public download(): Promise<UpdateView> {
    return this.serial(async () => {
      const descriptor = this.selected;
      this.readyFile = undefined;
      if (!descriptor)
        return this.view('error', 'Сначала проверьте наличие обновлений.');
      await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
      const extension =
        descriptor.target === 'linux-x64'
          ? '.AppImage'
          : descriptor.target === 'win32-x64'
            ? '.exe'
            : '.zip';
      const file = path.join(
        this.options.directory,
        `music-downloader-${descriptor.version}-${descriptor.target}-${descriptor.sha256.slice(0, 12)}${extension}`,
      );
      const temporary = file + '.part';
      await rm(temporary, { force: true });
      try {
        const response = await this.request(descriptor.url);
        if (!response.ok || !response.body) throw new Error('UPDATE_HTTP');
        const hash = createHash('sha256');
        let size = 0;
        const handle = await open(temporary, 'wx', 0o600);
        try {
          for await (const piece of chunks(response.body)) {
            size += piece.length;
            if (size > descriptor.size) throw new Error('UPDATE_SIZE');
            hash.update(piece);
            await handle.writeFile(piece);
          }
          if (
            size !== descriptor.size ||
            hash.digest('hex') !== descriptor.sha256
          )
            throw new Error('UPDATE_HASH');
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, file);
        this.readyFile = file;
        return this.view(
          'ready',
          'Пакет проверен. Откройте папку, закройте приложение и замените portable-файлы. Настройки и история сохранятся.',
        );
      } finally {
        await rm(temporary, { force: true });
      }
    });
  }
  public reveal(): Promise<UpdateView> {
    return this.serial(async () => {
      if (!this.readyFile || !this.selected)
        throw new Error('UPDATE_NOT_READY');
      const bytes = await readFile(this.readyFile);
      if (
        bytes.length !== this.selected.size ||
        digest(bytes) !== this.selected.sha256
      ) {
        this.readyFile = undefined;
        throw new Error('UPDATE_HASH');
      }
      await this.options.reveal(this.readyFile);
      return this.view(
        'ready',
        'Закройте приложение и замените его файлы проверенным portable-пакетом.',
      );
    });
  }
}
