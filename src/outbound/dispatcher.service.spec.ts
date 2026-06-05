import { Test, TestingModule } from '@nestjs/testing';
import { DispatcherService } from './dispatcher.service';
import { ProcessingService } from '../core/processing.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { ConfigService } from '@nestjs/config';

describe('DispatcherService', () => {
  let service: DispatcherService;
  let processing: { process: jest.Mock };
  let kafkaProducer: { send: jest.Mock };
  let configGet: jest.Mock;

  beforeEach(async () => {
    processing = { process: jest.fn() };
    kafkaProducer = { send: jest.fn() };
    configGet = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherService,
        { provide: ProcessingService, useValue: processing },
        { provide: KafkaProducerService, useValue: kafkaProducer },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get<DispatcherService>(DispatcherService);
  });

  it('should dispatch success and send kafka message', async () => {
    configGet.mockReturnValue(true);
    processing.process.mockResolvedValue(undefined);

    await service.dispatch({
      eventId: 'e1',
      operation: 'create',
      targetSystem: 'zabbix',
      payload: {},
    });

    expect(processing.process).toHaveBeenCalled();
    expect(kafkaProducer.send).toHaveBeenCalledWith(
      'idm.events.out',
      expect.objectContaining({ status: 'success' }),
    );
  });

  it('should send failed kafka message on error', async () => {
    configGet.mockReturnValue(true);
    processing.process.mockRejectedValue(new Error('fail'));

    await service.dispatch({
      eventId: 'e1',
      operation: 'create',
      targetSystem: 'zabbix',
      payload: {},
    });

    expect(kafkaProducer.send).toHaveBeenCalledWith(
      'idm.events.out',
      expect.objectContaining({ status: 'failed', error: 'fail' }),
    );
  });

  it('should skip kafka when disabled', async () => {
    configGet.mockReturnValue(false);
    processing.process.mockResolvedValue(undefined);

    await service.dispatch({
      eventId: 'e1',
      operation: 'create',
      targetSystem: 'zabbix',
      payload: {},
    });

    expect(kafkaProducer.send).not.toHaveBeenCalled();
  });
});
