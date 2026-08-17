import { IsInt, IsUUID, Length, Min } from 'class-validator';
import type { UpdateNotePayload } from '../../contracts';

export class UpdateNoteDto implements UpdateNotePayload {
  @IsUUID()
  noteId!: string;

  @Length(1, 500)
  text!: string;

  @IsInt()
  @Min(1)
  version!: number;
}
