import { IsNumber } from 'class-validator';
import type { CursorMovePayload } from '../../contracts';

export class CursorMoveDto implements CursorMovePayload {
  @IsNumber()
  x!: number;

  @IsNumber()
  y!: number;
}
