import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Board } from './board.entity';

@Entity('board_columns')
@Index(['boardId', 'position'])
export class BoardColumn {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'board_id' })
  boardId!: string;

  @ManyToOne(() => Board, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_id' })
  board!: Board;

  @Column({ length: 60 })
  title!: string;

  @Column({ length: 7 })
  color!: string;

  @Column({ type: 'smallint' })
  position!: number;
}
