import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher.js';

// Doubles as a smoke test: argon2 is a native module, so this fails in CI if its binary cannot load.
describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes with argon2id and never stores the plain password', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('correct horse');
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    expect(await hasher.verify(hash, 'correct horse battery staple')).toBe(true);
    expect(await hasher.verify(hash, 'wrong password')).toBe(false);
  });

  it('salts every hash, so the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([hasher.hash('same'), hasher.hash('same')]);
    expect(a).not.toBe(b);
  });

  it('treats a malformed stored hash as a failed verification, not an error', async () => {
    expect(await hasher.verify('not-a-hash', 'anything')).toBe(false);
  });
});
