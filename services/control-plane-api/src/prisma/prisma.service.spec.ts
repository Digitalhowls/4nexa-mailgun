const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.$connect = mockConnect;
    this.$disconnect = mockDisconnect;
  }),
}));

import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PrismaService();
  });

  it('se instancia correctamente extendiendo PrismaClient', () => {
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(PrismaService);
  });

  it('onModuleInit() llama a $connect()', async () => {
    await service.onModuleInit();
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('onModuleDestroy() llama a $disconnect()', async () => {
    await service.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('onModuleInit() y onModuleDestroy() se pueden llamar en secuencia', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
