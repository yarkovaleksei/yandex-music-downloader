import type { DesktopEvent, Method } from './desktop-api.js';
export interface Request {
  readonly v: 1;
  readonly id: string;
  readonly method: Method | 'shutdown';
  readonly payload: unknown;
}
export interface Response {
  readonly v: 1;
  readonly id: string;
  readonly result: unknown;
}
export interface EventMessage {
  readonly v: 1;
  readonly event: DesktopEvent;
}
/** Только структурные DTO; Electron MessagePort остаётся за адаптером. */
export interface Port {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): unknown;
  start(): void;
  close(): void;
}
