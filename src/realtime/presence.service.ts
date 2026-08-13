import { Injectable } from '@nestjs/common';
import type { ParticipantDto } from '../contracts';

interface UserPresence {
  participant: ParticipantDto;
  socketIds: Set<string>;
}

@Injectable()
export class PresenceService {
  private readonly boards = new Map<string, Map<string, UserPresence>>();

  addConnection(
    boardId: string,
    participant: ParticipantDto,
    socketId: string,
  ): boolean {
    let users = this.boards.get(boardId);
    if (!users) {
      users = new Map();
      this.boards.set(boardId, users);
    }

    const existing = users.get(participant.userId);
    if (existing) {
      existing.socketIds.add(socketId);
      return false;
    }

    users.set(participant.userId, {
      participant,
      socketIds: new Set([socketId]),
    });
    return true;
  }

  removeConnection(boardId: string, userId: string, socketId: string): boolean {
    const users = this.boards.get(boardId);
    if (!users) return false;

    const entry = users.get(userId);
    if (!entry) return false;

    entry.socketIds.delete(socketId);
    if (entry.socketIds.size > 0) return false;

    users.delete(userId);
    if (users.size === 0) this.boards.delete(boardId);
    return true;
  }

  list(boardId: string): ParticipantDto[] {
    const users = this.boards.get(boardId);
    if (!users) return [];
    return Array.from(users.values()).map((entry) => entry.participant);
  }
}
