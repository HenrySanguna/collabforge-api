import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BoardColumn } from './board-column.entity';
import { BoardMember } from './board-member.entity';

export type BoardPhase = 'COLLECTING' | 'GROUPING' | 'VOTING' | 'DISCUSSING';

@Entity('boards')
export class Board {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 40 })
  slug!: string;

  @Column({ length: 120 })
  title!: string;

  @Column({ name: 'owner_id' })
  ownerId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: User;

  @Column({ type: 'varchar', length: 16, default: 'COLLECTING' })
  phase!: BoardPhase;

  @Column({ default: false })
  revealed!: boolean;

  @Column({ name: 'vote_budget', type: 'smallint', default: 3 })
  voteBudget!: number;

  @Column({ name: 'allow_multi_vote', default: false })
  allowMultiVote!: boolean;

  @Column({ name: 'live_tally', default: false })
  liveTally!: boolean;

  @Column({ name: 'timer_ends_at', type: 'timestamptz', nullable: true })
  timerEndsAt!: Date | null;

  @Column({ name: 'is_archived', default: false })
  isArchived!: boolean;

  @Column({ name: 'invite_token_id', type: 'uuid', nullable: true })
  inviteTokenId!: string | null; // rotarlo invalida los enlaces anteriores

  @Column({ name: 'invite_expires_at', type: 'timestamptz', nullable: true })
  inviteExpiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => BoardColumn, (c) => c.board, { cascade: ['insert'] })
  columns!: BoardColumn[];

  @OneToMany(() => BoardMember, (m) => m.board)
  members!: BoardMember[];
}
