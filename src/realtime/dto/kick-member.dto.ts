import { IsUUID } from 'class-validator';
import type { KickPayload } from '../../contracts';

export class KickMemberDto implements KickPayload {
  @IsUUID()
  userId!: string;
}
