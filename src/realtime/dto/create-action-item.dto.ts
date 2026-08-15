import { IsOptional, IsUUID, Length } from 'class-validator';
import type { CreateActionItemPayload } from '../../contracts';

export class CreateActionItemDto implements CreateActionItemPayload {
  @Length(1, 2000)
  text!: string;

  // IsOptional skips validation for both `undefined` and `null`, so this
  // accepts "omitted", "explicit null", or a valid UUID string.
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;
}
