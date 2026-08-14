import { IsUUID } from 'class-validator';
import type { CastVotePayload } from '../../contracts';

export class CastVoteDto implements CastVotePayload {
  @IsUUID()
  noteId!: string;
}
