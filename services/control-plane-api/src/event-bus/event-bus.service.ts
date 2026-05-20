import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, type Job } from 'bullmq';
import { createLogger } from '@4nexa/logger';
import { RedisService } from '../redis/redis.service';
import type { SystemEvent, SystemEventType } from './event-bus.types';
import { EVENT_PRIORITIES } from './event-bus.types';

const logger = createLogger({ service: 'event-bus' });

export const EVENT_QUEUE_NAME = 'system-events';
export const DLQ_QUEUE_NAME   = 'system-events-dlq';

/**
 * EventBusService — publica eventos del sistema en la queue BullMQ.
 *
 * Priority queues (§21.4): cada evento tiene una prioridad definida en EVENT_PRIORITIES.
 * DLQ (§21.5): jobs que agotan todos sus reintentos se mueven a system-events-dlq.
 * Backoff exponencial (§21.7): configurado en defaultJobOptions.
 */
@Injectable()
export class EventBusService implements OnModuleInit, OnModuleDestroy {
  private queue!: Queue<SystemEvent, void, SystemEventType>;
  private dlqQueue!: Queue<SystemEvent, void, SystemEventType>;

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    const sharedJobOptions = {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1_000 },
    };

    this.queue = new Queue<SystemEvent, void, SystemEventType>(EVENT_QUEUE_NAME, {
      connection: this.redis.client,
      defaultJobOptions: sharedJobOptions,
    });

    // La DLQ no tiene Worker — solo almacena jobs para inspección y restauración manual.
    this.dlqQueue = new Queue<SystemEvent, void, SystemEventType>(DLQ_QUEUE_NAME, {
      connection: this.redis.client,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: false,
        removeOnFail: false,
      },
    });

    logger.info({ queue: EVENT_QUEUE_NAME, dlq: DLQ_QUEUE_NAME }, 'EventBus queues inicializadas');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.dlqQueue.close();
  }

  /**
   * Publica un evento asignando la prioridad automáticamente según EVENT_PRIORITIES.
   * Fire-and-forget: los fallos se loguean pero nunca se propagan.
   */
  async publish(event: SystemEvent): Promise<void> {
    try {
      const priority = EVENT_PRIORITIES[event.type] ?? 50;
      await this.queue.add(event.type, event, {
        priority,
        jobId: `${event.type}:${event.occurredAt}:${Math.random().toString(36).slice(2)}`,
      });
      logger.debug({ eventType: event.type, priority }, 'Evento publicado');
    } catch (err) {
      logger.error(
        err instanceof Error ? err : new Error(String(err)),
        `No se pudo publicar evento ${event.type}`,
      );
    }
  }

  /**
   * Publica múltiples eventos en bulk con sus prioridades respectivas.
   */
  async publishBulk(events: SystemEvent[]): Promise<void> {
    if (events.length === 0) return;
    try {
      await this.queue.addBulk(
        events.map((event) => ({
          name: event.type,
          data: event,
          opts: {
            priority: EVENT_PRIORITIES[event.type] ?? 50,
            jobId: `${event.type}:${event.occurredAt}:${Math.random().toString(36).slice(2)}`,
          },
        })),
      );
      logger.debug({ count: events.length }, 'Eventos publicados en bulk');
    } catch (err) {
      logger.error(
        err instanceof Error ? err : new Error(String(err)),
        'No se pudo publicar eventos en bulk',
      );
    }
  }

  /**
   * Mueve un job fallido a la Dead-Letter Queue cuando agota todos sus reintentos.
   * Llamado por EventProcessorService en el handler 'failed'.
   */
  async moveJobToDlq(job: Job<SystemEvent>): Promise<void> {
    try {
      await this.dlqQueue.add(job.name as SystemEventType, job.data, {
        jobId: `dlq:${job.id ?? 'unknown'}`,
      });
      logger.warn(
        { jobId: job.id, eventType: job.name, attemptsMade: job.attemptsMade },
        'Job movido a DLQ por agotar reintentos',
      );
    } catch (err) {
      logger.error(
        err instanceof Error ? err : new Error(String(err)),
        `No se pudo mover job ${job.id} a DLQ`,
      );
    }
  }

  /** Expone la cola principal para inspección. */
  getQueue(): Queue<SystemEvent, void, SystemEventType> {
    return this.queue;
  }

  /** Expone la DLQ para inspección. */
  getDlqQueue(): Queue<SystemEvent, void, SystemEventType> {
    return this.dlqQueue;
  }
}
