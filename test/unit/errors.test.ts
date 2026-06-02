import { describe, it, expect } from 'vitest';
import { VibeguardError, ErrorCodes, getExitCode, formatErrorJson, formatErrorTerminal } from '../../src/utils/errors.js';

describe('Error Handling', () => {
  it('VibeguardError has correct properties', () => {
    const err = new VibeguardError(ErrorCodes.CONFIG_INVALID, 'bad config', { key: 'ignore' });
    expect(err.code).toBe('CONFIG_INVALID');
    expect(err.message).toBe('bad config');
    expect(err.details).toEqual({ key: 'ignore' });
    expect(err.name).toBe('VibeguardError');
  });

  it('getExitCode returns 2 for usage errors', () => {
    expect(getExitCode(ErrorCodes.UNKNOWN_COMMAND)).toBe(2);
    expect(getExitCode(ErrorCodes.UNKNOWN_OPTION)).toBe(2);
  });

  it('getExitCode returns 3 for internal errors', () => {
    expect(getExitCode(ErrorCodes.INTERNAL_ERROR)).toBe(3);
  });

  it('getExitCode returns 1 for recoverable errors', () => {
    expect(getExitCode(ErrorCodes.CONFIG_INVALID)).toBe(1);
    expect(getExitCode(ErrorCodes.ALREADY_EXISTS)).toBe(1);
    expect(getExitCode(ErrorCodes.LIMIT_EXCEEDED)).toBe(1);
  });

  it('formatErrorJson produces correct structure', () => {
    const err = new VibeguardError(ErrorCodes.CONFIG_INVALID, 'test error', { key: 'x' });
    const json = formatErrorJson(err);

    expect(json.schemaVersion).toBe('1.0.0');
    expect(json.error.code).toBe('CONFIG_INVALID');
    expect(json.error.message).toBe('test error');
    expect(json.error.details).toEqual({ key: 'x' });
  });

  it('formatErrorTerminal produces readable string', () => {
    const err = new VibeguardError(ErrorCodes.ALREADY_EXISTS, 'file exists');
    const msg = formatErrorTerminal(err);

    expect(msg).toContain('ALREADY_EXISTS');
    expect(msg).toContain('file exists');
  });
});
