export const SCHEMA_VERSION = '1.0.0';

export function wrapJsonOutput(data: Record<string, unknown>): string {
  const output = {
    schemaVersion: SCHEMA_VERSION,
    ...data,
  };
  return JSON.stringify(output, null, 2);
}

export function emitJson(data: Record<string, unknown>): void {
  process.stdout.write(wrapJsonOutput(data) + '\n');
}
