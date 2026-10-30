/** REQ-057: исключение 11–14 проверяется до последней цифры, включая 111. */
export function quantity(
  value: number,
  forms: readonly [string, string, string],
): string {
  const count = Math.abs(Math.trunc(value));
  const last = count % 10;
  const teen = count % 100;
  return `${value} ${forms[teen >= 11 && teen <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2]}`;
}
export const tracksQuantity = (value: number) =>
  quantity(value, ['трек', 'трека', 'треков']);
