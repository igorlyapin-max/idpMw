import { Test, TestingModule } from '@nestjs/testing';
import { TargetSystemController } from './target-system.controller';
import { TargetSystemService } from './target-system.service';
import { ConnectorRegistry } from '../connectors/connector.registry';

describe('TargetSystemController', () => {
  let controller: TargetSystemController;
  let service: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    testConnection: jest.Mock;
  };
  let registry: { reload: jest.Mock };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      testConnection: jest.fn(),
    };
    registry = { reload: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TargetSystemController],
      providers: [
        { provide: TargetSystemService, useValue: service },
        { provide: ConnectorRegistry, useValue: registry },
      ],
    }).compile();

    controller = module.get<TargetSystemController>(TargetSystemController);
  });

  it('findAll should delegate to service', async () => {
    service.findAll.mockResolvedValue([{ id: '1', name: 'z1' }]);
    const result = await controller.findAll('zabbix', 'true', '10', '0');
    expect(service.findAll).toHaveBeenCalledWith({
      type: 'zabbix',
      enabled: true,
      limit: 10,
      offset: 0,
    });
    expect(result).toEqual([{ id: '1', name: 'z1' }]);
  });

  it('findById should delegate to service', async () => {
    service.findById.mockResolvedValue({ id: '1' });
    const result = await controller.findById('1');
    expect(service.findById).toHaveBeenCalledWith('1');
    expect(result).toEqual({ id: '1' });
  });

  it('create should reload registry', async () => {
    service.create.mockResolvedValue({ id: '1' });
    const dto = {
      name: 'z1',
      type: 'zabbix',
      label: 'Z',
      config: {},
      enabled: true,
    };
    const result = await controller.create(dto);
    expect(service.create).toHaveBeenCalledWith(dto);
    expect(registry.reload).toHaveBeenCalled();
    expect(result).toEqual({ id: '1' });
  });

  it('update should reload registry', async () => {
    service.update.mockResolvedValue({ id: '1' });
    const dto = { label: 'Updated' };
    const result = await controller.update('1', dto);
    expect(service.update).toHaveBeenCalledWith('1', dto);
    expect(registry.reload).toHaveBeenCalled();
    expect(result).toEqual({ id: '1' });
  });

  it('delete should reload registry', async () => {
    service.delete.mockResolvedValue({ id: '1' });
    const result = await controller.delete('1');
    expect(service.delete).toHaveBeenCalledWith('1');
    expect(registry.reload).toHaveBeenCalled();
    expect(result).toEqual({ id: '1' });
  });

  it('testConnection should delegate to service', async () => {
    service.testConnection.mockResolvedValue({ success: true, message: 'OK' });
    const result = await controller.testConnection('1');
    expect(service.testConnection).toHaveBeenCalledWith('1');
    expect(result).toEqual({ success: true, message: 'OK' });
  });
});
