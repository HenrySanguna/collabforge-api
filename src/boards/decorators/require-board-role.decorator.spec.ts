import 'reflect-metadata';
import {
  RequireBoardRole,
  BOARD_ROLE_KEY,
} from './require-board-role.decorator';

describe('RequireBoardRole', () => {
  it('adjunta el rol requerido como metadata', () => {
    class Dummy {
      @RequireBoardRole('owner')
      handler(): void {}
    }

    const metadata = Reflect.getMetadata(
      BOARD_ROLE_KEY,
      Dummy.prototype.handler,
    ) as string;
    expect(metadata).toBe('owner');
  });
});
