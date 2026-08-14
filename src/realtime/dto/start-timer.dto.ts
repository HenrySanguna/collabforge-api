import { IsInt, Max, Min } from 'class-validator';
import type { StartTimerPayload } from '../../contracts';

export class StartTimerDto implements StartTimerPayload {
  @IsInt()
  @Min(30)
  @Max(3600)
  durationSeconds!: number;
}
