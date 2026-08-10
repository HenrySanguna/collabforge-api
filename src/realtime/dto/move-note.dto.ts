import { IsInt, IsNumber, IsUUID, Min } from 'class-validator';
import type { MoveNotePayload } from '../../contracts';

export class MoveNoteDto implements MoveNotePayload {
  @IsUUID()
  noteId!: string;

  @IsUUID()
  columnId!: string;

  @IsNumber()
  position!: number;

  @IsInt()
  @Min(1)
  version!: number;
}
