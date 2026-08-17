import { IsIn, Length } from 'class-validator';
import { BOARD_TEMPLATES } from '../templates';
import type { BoardTemplateKey } from '../templates';

const TEMPLATE_KEYS = Object.keys(BOARD_TEMPLATES) as BoardTemplateKey[];

export class CreateBoardDto {
  @Length(1, 120)
  title!: string;

  @IsIn(TEMPLATE_KEYS)
  templateKey!: BoardTemplateKey;
}
