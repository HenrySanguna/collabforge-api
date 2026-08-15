import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import type { ClientEvents, ErrorCode } from '../contracts';

export type ObservableClientEvent = keyof ClientEvents;
export type WsEventOutcome = 'ok' | 'error';

const EVENT_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5,
];
const SESSION_DURATION_BUCKETS = [
  5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600,
];

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly activeConnections: Gauge;
  private readonly wsEventsTotal: Counter<'event' | 'outcome'>;
  private readonly wsEventDurationSeconds: Histogram<'event'>;
  private readonly wsErrorsTotal: Counter<'code'>;
  private readonly boardSessionDurationSeconds: Histogram;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.activeConnections = new Gauge({
      name: 'collabforge_ws_active_connections',
      help: 'Number of currently open board WebSocket connections.',
      registers: [this.registry],
    });

    this.wsEventsTotal = new Counter({
      name: 'collabforge_ws_events_total',
      help: 'Total board WebSocket events handled, by event and outcome.',
      labelNames: ['event', 'outcome'],
      registers: [this.registry],
    });

    this.wsEventDurationSeconds = new Histogram({
      name: 'collabforge_ws_event_duration_seconds',
      help: 'Board WebSocket event handler duration in seconds.',
      labelNames: ['event'],
      buckets: EVENT_DURATION_BUCKETS,
      registers: [this.registry],
    });

    this.wsErrorsTotal = new Counter({
      name: 'collabforge_ws_errors_total',
      help: 'Total board WebSocket errors, by error code.',
      labelNames: ['code'],
      registers: [this.registry],
    });

    this.boardSessionDurationSeconds = new Histogram({
      name: 'collabforge_board_session_duration_seconds',
      help: 'Duration of a board WebSocket connection session, in seconds.',
      buckets: SESSION_DURATION_BUCKETS,
      registers: [this.registry],
    });
  }

  incConnection(): void {
    this.activeConnections.inc();
  }

  decConnection(): void {
    this.activeConnections.dec();
  }

  recordWsEvent(
    event: ObservableClientEvent,
    outcome: WsEventOutcome,
    durationSeconds: number,
  ): void {
    this.wsEventsTotal.inc({ event, outcome });
    this.wsEventDurationSeconds.observe({ event }, durationSeconds);
  }

  recordWsError(code: ErrorCode): void {
    this.wsErrorsTotal.inc({ code });
  }

  recordBoardSessionDuration(durationSeconds: number): void {
    this.boardSessionDurationSeconds.observe(durationSeconds);
  }
}
