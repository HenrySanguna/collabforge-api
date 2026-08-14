import { IsUUID } from 'class-validator';
import type { RetractVotePayload } from '../../contracts';

export class RetractVoteDto implements RetractVotePayload {
  @IsUUID()
  noteId!: string;
}
