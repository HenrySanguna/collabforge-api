import { Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BoardsService } from '../boards/boards.service';
import type { BoardRole } from '../boards/entities/board-member.entity';
import { NoteSerializerService } from './note-serializer.service';
import { Note } from './entities/note.entity';

const MAX_NOTES_PER_BOARD = 500;

interface CreateNoteInput {
  columnId: string;
  text: string;
}

interface UpdateNoteInput {
  noteId: string;
  text: string;
  version: number;
}

interface MoveNoteInput {
  noteId: string;
  columnId: string;
  position: number;
  version: number;
}

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note) private readonly notes: Repository<Note>,
    private readonly boards: BoardsService,
    private readonly serializer: NoteSerializerService,
  ) {}

  findAllForBoard(boardId: string): Promise<Note[]> {
    return this.notes.find({
      where: { boardId },
      relations: { author: true },
      order: { createdAt: 'ASC' },
    });
  }

  async create(
    boardId: string,
    authorId: string,
    input: CreateNoteInput,
  ): Promise<Note> {
    const board = await this.boards.findByIdOrFail(boardId);
    if (board.isArchived) {
      throw new WsException({
        code: 'BOARD_ARCHIVED',
        message: 'This board is archived.',
      });
    }

    const count = await this.notes.count({ where: { boardId } });
    if (count >= MAX_NOTES_PER_BOARD) {
      throw new WsException({
        code: 'BOARD_LIMIT_REACHED',
        message: `This board reached the limit of ${MAX_NOTES_PER_BOARD} notes.`,
      });
    }

    const [last] = await this.notes.find({
      where: { columnId: input.columnId },
      order: { position: 'DESC' },
      take: 1,
    });

    const note = this.notes.create({
      boardId,
      columnId: input.columnId,
      authorId,
      text: input.text,
      position: (last?.position ?? 0) + 1,
    });
    const saved = await this.notes.save(note);
    return this.findByIdOrFail(saved.id);
  }

  async update(
    boardId: string,
    userId: string,
    input: UpdateNoteInput,
  ): Promise<Note> {
    const note = await this.findByIdInBoardOrFail(boardId, input.noteId);
    if (note.authorId !== userId) {
      throw new WsException({
        code: 'FORBIDDEN_ROLE',
        message: 'Only the author can edit this note.',
      });
    }
    this.assertVersion(note, input.version);

    note.text = input.text;
    await this.notes.save(note);
    return this.findByIdOrFail(note.id);
  }

  async move(boardId: string, input: MoveNoteInput): Promise<Note> {
    const note = await this.findByIdInBoardOrFail(boardId, input.noteId);
    this.assertVersion(note, input.version);

    note.columnId = input.columnId;
    note.position = input.position;
    await this.notes.save(note);
    return this.findByIdOrFail(note.id);
  }

  async remove(
    boardId: string,
    userId: string,
    role: BoardRole,
    noteId: string,
  ): Promise<void> {
    const note = await this.findByIdInBoardOrFail(boardId, noteId);
    if (note.authorId !== userId && role !== 'owner') {
      throw new WsException({
        code: 'FORBIDDEN_ROLE',
        message: 'Only the author or the board owner can delete this note.',
      });
    }
    await this.notes.remove(note);
  }

  private async findByIdOrFail(id: string): Promise<Note> {
    const note = await this.notes.findOne({
      where: { id },
      relations: { author: true },
    });
    if (!note) {
      throw new WsException({
        code: 'NOTE_NOT_FOUND',
        message: 'Note not found.',
      });
    }
    return note;
  }

  private async findByIdInBoardOrFail(
    boardId: string,
    id: string,
  ): Promise<Note> {
    const note = await this.findByIdOrFail(id);
    if (note.boardId !== boardId) {
      throw new WsException({
        code: 'NOTE_NOT_FOUND',
        message: 'Note not found.',
      });
    }
    return note;
  }

  private assertVersion(note: Note, expected: number): void {
    if (note.version !== expected) {
      throw new WsException({
        code: 'VERSION_CONFLICT',
        message: 'This note changed since your last known version.',
        meta: { note: this.serializer.forAuthor(note) },
      });
    }
  }
}
