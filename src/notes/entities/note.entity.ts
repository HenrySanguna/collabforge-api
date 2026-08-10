import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Board } from '../../boards/entities/board.entity';
import { BoardColumn } from '../../boards/entities/board-column.entity';

@Entity('notes')
@Index(['boardId', 'columnId'])
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'board_id' })
  boardId!: string;

  @ManyToOne(() => Board, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_id' })
  board!: Board;

  @Column({ name: 'column_id' })
  columnId!: string;

  @ManyToOne(() => BoardColumn, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'column_id' })
  column!: BoardColumn;

  @Column({ name: 'author_id' })
  authorId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author!: User;

  @Column({ type: 'varchar', length: 500 })
  text!: string;

  @Column({ type: 'double precision' })
  position!: number;

  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId!: string | null;

  @VersionColumn()
  version!: number;

  @Column({ name: 'is_discussed', default: false })
  isDiscussed!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
