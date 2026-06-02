export const SCHEMA_VERSION = '1.0.0';
export function wrapJsonOutput(data) {
    const output = {
        schemaVersion: SCHEMA_VERSION,
        ...data,
    };
    return JSON.stringify(output, null, 2);
}
export function emitJson(data) {
    process.stdout.write(wrapJsonOutput(data) + '\n');
}
//# sourceMappingURL=json-output.js.map