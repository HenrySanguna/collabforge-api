import { readFileSync } from 'fs';
import { join } from 'path';
import { CONTRACTS_VERSION } from './events';

describe('CONTRACTS_VERSION', () => {
  it('matches src/contracts/package.json version', () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, 'package.json'), 'utf-8'),
    ) as { version: string };
    expect(CONTRACTS_VERSION).toBe(pkg.version);
  });
});
