import type {
  AgentOperation,
  AgentResponse,
  ApplyConfigPayload,
  ApplyConfigResult,
  ReloadServicePayload,
  ReloadServiceResult,
  HealthCheckPayload,
  HealthCheckResult,
  BackupExecutePayload,
  BackupExecuteResult,
  MetricsReportPayload,
  MetricsReportResult,
  QueueStatsPayload,
  QueueStatsResult,
} from '../contracts/agent.contracts';

/**
 * Interfaz común para MockOperationsService y MailNodeOperationsService.
 * Permite que el módulo seleccione la implementación según AGENT_MODE.
 */
export interface IOperationsService {
  applyConfig(payload: ApplyConfigPayload): Promise<ApplyConfigResult>;
  reloadService(payload: ReloadServicePayload): Promise<ReloadServiceResult>;
  healthCheck(payload: HealthCheckPayload): Promise<HealthCheckResult>;
  backupExecute(payload: BackupExecutePayload): Promise<BackupExecuteResult>;
  metricsReport(payload: MetricsReportPayload): Promise<MetricsReportResult>;
  queueStats(payload: QueueStatsPayload): Promise<QueueStatsResult>;

  buildResponse<T>(
    operation: AgentOperation,
    correlationId: string,
    startMs: number,
    data: T,
  ): AgentResponse<T>;

  buildErrorResponse(
    operation: AgentOperation,
    correlationId: string,
    startMs: number,
    error: string,
  ): AgentResponse<never>;
}

export const OPERATIONS_SERVICE = Symbol('OPERATIONS_SERVICE');
