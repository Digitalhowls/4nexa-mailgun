import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

/**
 * Expone el endpoint Prometheus /metrics.
 *
 * No requiere autenticación (los scrapers de Prometheus no envían tokens).
 * La protección se delega al nivel de red / reverse proxy.
 *
 * Naming convention: 4nexa_mailgun_<service>_<metric> (§22.3)
 */
@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Métricas Prometheus del sistema' })
  async getMetrics(): Promise<string> {
    return this.metricsService.collect();
  }
}
