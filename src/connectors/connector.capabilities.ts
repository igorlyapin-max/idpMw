import {
  AVANPOST_OPERATION_VALUES,
  READ_OPERATIONS,
  WRITE_OPERATIONS,
} from '../inbound/webhooks/avanpost-operation.enum';
import type {
  ConnectorCapabilities,
  ConnectorOperationCapability,
} from './connector.interface';

export function createConnectorCapabilities(
  partialOperations: Record<string, string> = {},
  capabilityOverrides: Partial<ConnectorCapabilities['capabilities']> = {},
): ConnectorCapabilities {
  const operationStatus = Object.fromEntries(
    AVANPOST_OPERATION_VALUES.map((operation) => {
      const reason = partialOperations[operation];
      const capability: ConnectorOperationCapability = reason
        ? { status: 'partial', reason }
        : { status: 'implemented' };
      return [operation, capability];
    }),
  ) as Record<string, ConnectorOperationCapability>;

  return {
    operations: [...AVANPOST_OPERATION_VALUES],
    readOperations: [...READ_OPERATIONS],
    writeOperations: [...WRITE_OPERATIONS],
    capabilities: {
      supportsRead: true,
      supportsWrite: true,
      supportsSync: true,
      supportsIncrementalSync: true,
      supportsSchema: true,
      ...capabilityOverrides,
    },
    operationStatus,
    ...(Object.keys(partialOperations).length > 0 ? { partialOperations } : {}),
  };
}
