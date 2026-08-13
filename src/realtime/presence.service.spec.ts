import { PresenceService } from './presence.service';
import type { ParticipantDto } from '../contracts';

function aParticipant(overrides: Partial<ParticipantDto> = {}): ParticipantDto {
  return {
    userId: 'user-1',
    name: 'Ana',
    avatarColor: '#abcdef',
    role: 'member',
    isOnline: true,
    ...overrides,
  };
}

describe('PresenceService', () => {
  let service: PresenceService;

  beforeEach(() => {
    service = new PresenceService();
  });

  it('añade una conexión y la refleja en list()', () => {
    const changed = service.addConnection(
      'board-1',
      aParticipant(),
      'socket-1',
    );

    expect(changed).toBe(true);
    expect(service.list('board-1')).toEqual([aParticipant()]);
  });

  it('elimina la única conexión de un usuario y lo quita de list()', () => {
    service.addConnection('board-1', aParticipant(), 'socket-1');

    const changed = service.removeConnection('board-1', 'user-1', 'socket-1');

    expect(changed).toBe(true);
    expect(service.list('board-1')).toEqual([]);
  });

  it('una segunda pestaña del mismo usuario no cambia la presencia', () => {
    service.addConnection('board-1', aParticipant(), 'socket-1');

    const changed = service.addConnection(
      'board-1',
      aParticipant(),
      'socket-2',
    );

    expect(changed).toBe(false);
    expect(service.list('board-1')).toEqual([aParticipant()]);
  });

  it('solo desaparece al cerrar la última pestaña', () => {
    service.addConnection('board-1', aParticipant(), 'socket-1');
    service.addConnection('board-1', aParticipant(), 'socket-2');

    const firstRemoval = service.removeConnection(
      'board-1',
      'user-1',
      'socket-1',
    );
    expect(firstRemoval).toBe(false);
    expect(service.list('board-1')).toEqual([aParticipant()]);

    const secondRemoval = service.removeConnection(
      'board-1',
      'user-1',
      'socket-2',
    );
    expect(secondRemoval).toBe(true);
    expect(service.list('board-1')).toEqual([]);
  });

  it('mantiene usuarios distintos por separado en el mismo tablero', () => {
    service.addConnection('board-1', aParticipant({ userId: 'user-1' }), 's1');
    service.addConnection(
      'board-1',
      aParticipant({ userId: 'user-2', name: 'Bruno' }),
      's2',
    );

    const list = service.list('board-1');
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.userId).sort()).toEqual(['user-1', 'user-2']);
  });

  it('eliminar un socket que nunca se añadió no lanza y devuelve false', () => {
    expect(() =>
      service.removeConnection('board-1', 'user-1', 'socket-x'),
    ).not.toThrow();
    expect(service.removeConnection('board-1', 'user-1', 'socket-x')).toBe(
      false,
    );

    service.addConnection('board-1', aParticipant(), 'socket-1');
    expect(
      service.removeConnection('board-1', 'user-1', 'unknown-socket'),
    ).toBe(false);
    expect(service.list('board-1')).toEqual([aParticipant()]);
  });

  it('list() de un tablero desconocido devuelve []', () => {
    expect(service.list('unknown-board')).toEqual([]);
  });
});
