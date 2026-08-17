import { IsString, IsUUID, Length } from 'class-validator';
import type { CreateNotePayload } from '../../contracts';

export class CreateNoteDto implements CreateNotePayload {
  @IsUUID()
  columnId!: string;

  @Length(1, 500)
  text!: string;

  @IsString()
  tempId!: string;
}
