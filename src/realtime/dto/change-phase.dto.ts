import { IsIn } from 'class-validator';
import type { BoardPhase, ChangePhasePayload } from '../../contracts';

const PHASES: BoardPhase[] = ['COLLECTING', 'GROUPING', 'VOTING', 'DISCUSSING'];

export class ChangePhaseDto implements ChangePhasePayload {
  @IsIn(PHASES)
  phase!: BoardPhase;
}
