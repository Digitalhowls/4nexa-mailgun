import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { JobState } from 'bullmq';
import { createLogger } from '@4nexa/logger';
import { EventBusService } from '../event-bus/event-bus.service';
import { NodeAgentClient } from '../node-agent/node-agent.client';

const logger = createLogger({ service: 'control-plane-api', module: 'QueueEngineService' });

export type InspectableState = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export interface QueueStats {
  main: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  dlq: {
    waiting: number;
  };
}

export interface JobSummary {
  id: string | undefined;
  name: string;
  state: string;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | undefined;
  finishedOn: number | undefined;
  failedReason: string | undefined;
  data: unknown;
}

@Injectable()
export class QueueEngineService {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly agentClient: NodeAgentClient,
  ) {}

  /**
   * Devuelve los contadores de la cola principal y la DLQ.
   */
  async getStats(): Promise<QueueStats> {
    const [mainCounts, dlqCounts] = await Promise.all([
      this.eventBus.getQueue().getJobCounts(
        'waiting', 'active', 'completed', 'failed', 'delayed',
      ),
      this.eventBus.getDlqQueue().getJobCounts('waiting'),
    ]);

    return {
      main: {
        waiting:   mainCounts['waiting']   ?? 0,
        active:    mainCounts['active']    ?? 0,
        completed: mainCounts['completed'] ?? 0,
        failed:    mainCounts['failed']    ?? 0,
        delayed:   mainCounts['delayed']   ?? 0,
      },
      dlq: {
        waiting: dlqCounts['waiting'] ?? 0,
      },
    };
  }

  /**
   * Lista jobs de la cola principal filtrados por estado, con paginación.
   */
  async getJobs(
    state: InspectableState,
    page: number,
    pageSize: number,
  ): Promise<{ items: JobSummary[]; total: number }> {
    const start = (page - 1) * pageSize;
    const end   = start + pageSize - 1;

    const [jobs, total] = await Promise.all([
      this.eventBus.getQueue().getJobs([state as JobState], start, end, true),
      this.eventBus.getQueue().getJobCounts(state as JobState),
    ]);

    const items: JobSummary[] = jobs.map((job) => ({
      id:           job.id,
      name:         job.name,
      state,
      attemptsMade: job.attemptsMade,
      timestamp:    job.timestamp,
      processedOn:  job.processedOn ?? undefined,
      finishedOn:   job.finishedOn  ?? undefined,
      failedReason: (job as { failedReason?: string }).failedReason ?? undefined,
      data:         job.data,
    }));

    return { items, total: total[state as string] ?? 0 };
  }

  /**
   * Reintenta un job fallido por su ID.
   */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.eventBus.getQueue().getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Job ${jobId} no encontrado`);
    }

    const state = await job.getState();
    if (state !== 'failed') {
      throw new BadRequestException(`El job ${jobId} no está en estado 'failed' (estado actual: ${state})`);
    }

    await job.retry('failed');
    logger.info({ jobId, eventType: job.name }, 'Job reintentado manualmente');
  }

  /**
   * Elimina todos los jobs en un estado específico de la cola principal.
   */
  async purgeByState(state: InspectableState): Promise<number> {
    if (state === 'active') {
      throw new BadRequestException("No se pueden purgar jobs en estado 'active'");
    }

    const queue = this.eventBus.getQueue();
    const jobs  = await queue.getJobs([state as JobState], 0, -1, true);

    for (const job of jobs) {
      await job.remove();
    }

    logger.warn({ state, count: jobs.length }, 'Jobs purgados');
    return jobs.length;
  }

  /**
   * Lista jobs de la DLQ.
   */
  async getDlqJobs(page: number, pageSize: number): Promise<{ items: JobSummary[]; total: number }> {
    const start = (page - 1) * pageSize;
    const end   = start + pageSize - 1;

    const [jobs, counts] = await Promise.all([
      this.eventBus.getDlqQueue().getJobs(['waiting'], start, end, true),
      this.eventBus.getDlqQueue().getJobCounts('waiting'),
    ]);

    const items: JobSummary[] = jobs.map((job) => ({
      id:           job.id,
      name:         job.name,
      state:        'dlq',
      attemptsMade: job.attemptsMade,
      timestamp:    job.timestamp,
      processedOn:  undefined,
      finishedOn:   undefined,
      failedReason: undefined,
      data:         job.data,
    }));

    return { items, total: counts['waiting'] ?? 0 };
  }

  /**
   * Restaura un job de la DLQ: lo elimina de la DLQ y lo republica en la cola principal.
   */
  async restoreDlqJob(jobId: string): Promise<void> {
    const dlqJob = await this.eventBus.getDlqQueue().getJob(jobId);
    if (!dlqJob) {
      throw new NotFoundException(`Job DLQ ${jobId} no encontrado`);
    }

    await this.eventBus.publish(dlqJob.data);
    await dlqJob.remove();
    logger.info({ jobId, eventType: dlqJob.name }, 'Job restaurado de DLQ a cola principal');
  }

  /**
   * Obtiene estadísticas de la cola SMTP de un nodo vía node-agent.
   */
  async getNodeQueueStats(nodeId: string): Promise<unknown> {
    const response = await this.agentClient.queueStats(nodeId);
    return response.data;
  }
}
