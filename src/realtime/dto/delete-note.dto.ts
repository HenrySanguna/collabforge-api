import { IsUUID } from 'class-validator';
import type { DeleteNotePayload } from '../../contracts';

export class DeleteNoteDto implements DeleteNotePayload {
  @IsUUID()
  noteId!: string;
}
