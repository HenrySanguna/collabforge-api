import { IsIn, IsOptional, IsUUID, Length } from 'class-validator';
import type { UpdateActionItemPayload } from '../../contracts';

export class UpdateActionItemDto implements UpdateActionItemPayload {
  @IsUUID()
  id!: string;

  @IsOptional()
  @Length(1, 2000)
  text?: string;

  // IsOptional skips validation for both `undefined` and `null`, so this
  // accepts "omitted", "explicit null", or a valid UUID string.
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsIn(['open', 'done'])
  status?: 'open' | 'done';
}
