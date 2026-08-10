import { SetMetadata } from '@nestjs/common';
import type { BoardPhase } from '../../contracts';

export const PHASES_KEY = 'phases';
export const AllowedPhases = (...phases: BoardPhase[]) =>
  SetMetadata(PHASES_KEY, phases);
