import { describe, expect, it } from 'vitest';
import { can } from './permissions';

describe('can', () => {
  it.each([
    ['owner', 'manage', true],
    ['editor', 'write', true],
    ['editor', 'manage', false],
    ['viewer', 'read', true],
    ['viewer', 'write', false],
  ] as const)('%s → %s = %s', (role, action, expected) => {
    expect(can(role, action)).toBe(expected);
  });
});
