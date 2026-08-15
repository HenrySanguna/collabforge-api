import { IsUUID } from 'class-validator';
import type { DeleteActionItemPayload } from '../../contracts';

export class DeleteActionItemDto implements DeleteActionItemPayload {
  @IsUUID()
  id!: string;
}
