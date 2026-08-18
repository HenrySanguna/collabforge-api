import { Injectable } from '@nestjs/common';
import { Board } from '../boards/entities/board.entity';
import type { BoardRole } from '../boards/entities/board-member.entity';
import { Note } from './entities/note.entity';
import type { AuthorDto, NoteDto } from '../contracts';

@Injectable()
export class NoteSerializerService {
  forOthers(note: Note, board: Board): NoteDto {
    const hideAuthor = !board.revealed && board.phase !== 'DISCUSSING';
    return this.toDto(note, hideAuthor);
  }

  forAuthor(note: Note): NoteDto {
    return this.toDto(note, false);
  }

  forOwner(note: Note): NoteDto {
    return this.toDto(note, false);
  }

  forViewer(
    note: Note,
    board: Board,
    viewerId: string,
    viewerRole: BoardRole,
  ): NoteDto {
    if (note.authorId === viewerId) return this.forAuthor(note);
    if (viewerRole === 'owner') return this.forOwner(note);
    return this.forOthers(note, board);
  }

  private toDto(note: Note, hideAuthor: boolean): NoteDto {
    return {
      id: note.id,
      columnId: note.columnId,
      text: note.text,
      position: note.position,
      groupId: note.groupId,
      version: note.version,
      isDiscussed: note.isDiscussed,
      author: hideAuthor ? null : this.toAuthorDto(note),
      createdAt: note.createdAt.toISOString(),
    };
  }

  private toAuthorDto(note: Note): AuthorDto {
    return {
      userId: note.author.id,
      name: note.author.name,
      avatarColor: note.author.avatarColor,
    };
  }
}
