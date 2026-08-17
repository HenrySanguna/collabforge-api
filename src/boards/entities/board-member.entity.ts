import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Board } from './board.entity';

export type BoardRole = 'owner' | 'member';

@Entity('board_members')
@Unique('uq_board_member', ['boardId', 'userId'])
@Index(['userId'])
export class BoardMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'board_id' })
  boardId!: string;

  @ManyToOne(() => Board, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'board_id' })
  board!: Board;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 10, default: 'member' })
  role!: BoardRole;

  @Column({ name: 'vote_budget', type: 'smallint', default: 3 })
  voteBudget!: number;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt!: Date;
}
