import { randomUUID } from 'node:crypto';
/** ADR-015: renderer получает ссылку, право на путь создаёт только системный диалог. */
export class DirectoryRegistry {
  private readonly selected = new Map<string, string>();
  public add(directory: string): { directoryRef: string; displayPath: string } {
    const directoryRef = `dir:${randomUUID()}`;
    this.selected.set(directoryRef, directory);
    return { directoryRef, displayPath: directory };
  }
  public addExecutable(file: string): {
    executableRef: string;
    displayPath: string;
  } {
    const executableRef = `exe:${randomUUID()}`;
    this.selected.set(executableRef, file);
    return { executableRef, displayPath: file };
  }
  public resolve(reference: string): string | undefined {
    return this.selected.get(reference);
  }
}
