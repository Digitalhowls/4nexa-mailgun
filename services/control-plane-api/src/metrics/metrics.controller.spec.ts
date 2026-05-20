import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import type { Server } from 'http';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController (HTTP)', () => {
  let app: INestApplication;

  const metricsServiceMock = {
    collect: jest.fn().mockResolvedValue('# HELP\n# TYPE\n'),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: MetricsService, useValue: metricsServiceMock }],
    }).compile();

    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(() => app.close());

  it('GET /metrics → 200 con métricas Prometheus', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/metrics')
      .expect(200);

    expect(typeof res.text).toBe('string');
    expect(metricsServiceMock.collect).toHaveBeenCalled();
  });
});
