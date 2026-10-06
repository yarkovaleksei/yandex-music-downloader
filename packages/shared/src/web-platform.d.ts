/**
 * Точечные ambient-типы чистых web-совместимых API для `packages/shared`.
 *
 * Production-конфигурация shared собирается с `lib: ES2023` без DOM и `types: []`,
 * чтобы случайно не получить Node/DOM globals и ввод-вывод. Здесь описаны только
 * API без ввода-вывода (ADR-001 п.5), которые нужны контрактным типам для preload
 * и renderer. Файл попадает только в production-программу shared и не объявляет
 * ничего из I/O (fetch, process, Buffer, window, indexedDB и т. п.).
 */
interface AbortSignal {
  readonly aborted: boolean;
  readonly reason: unknown;
  throwIfAborted(): void;
}

interface AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}

declare const AbortController: {
  prototype: AbortController;
  new (): AbortController;
};

declare const AbortSignal: {
  prototype: AbortSignal;
};

interface URLSearchParams {
  get(name: string): string | null;
  has(name: string): boolean;
  toString(): string;
}

declare const URLSearchParams: {
  prototype: URLSearchParams;
  new (init?: string | Record<string, string>): URLSearchParams;
};

interface URL {
  readonly href: string;
  readonly protocol: string;
  readonly host: string;
  readonly pathname: string;
  readonly search: string;
  readonly searchParams: URLSearchParams;
  toString(): string;
}

declare const URL: {
  prototype: URL;
  new (url: string, base?: string): URL;
};

interface TextEncoder {
  encode(input?: string): Uint8Array;
}

declare const TextEncoder: {
  prototype: TextEncoder;
  new (): TextEncoder;
};

interface TextDecoder {
  decode(input?: Uint8Array): string;
}

declare const TextDecoder: {
  prototype: TextDecoder;
  new (label?: string): TextDecoder;
};

interface ReadableStream<R = unknown> {
  readonly locked: boolean;
  cancel(reason?: unknown): Promise<void>;
  getReader(): {
    read(): Promise<{ done: boolean; value?: R }>;
    releaseLock(): void;
  };
}

declare const ReadableStream: {
  prototype: ReadableStream;
};
