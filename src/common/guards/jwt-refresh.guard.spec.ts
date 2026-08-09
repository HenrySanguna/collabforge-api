import { JwtRefreshGuard } from './jwt-refresh.guard';

describe('JwtRefreshGuard', () => {
  it('activa la estrategia jwt-refresh', () => {
    expect(new JwtRefreshGuard()).toBeInstanceOf(JwtRefreshGuard);
  });
});
