export interface ConnectorPayload {
  operation: string;
  targetSystem: string;
  payload: Record<string, unknown>;
}

export interface ConnectorResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export type ConnectorOperationStatus =
  | 'implemented'
  | 'partial'
  | 'unsupported';

export interface ConnectorOperationCapability {
  status: ConnectorOperationStatus;
  reason?: string;
}

export interface ConnectorCapabilities {
  operations: string[];
  readOperations: string[];
  writeOperations: string[];
  capabilities: {
    supportsRead: boolean;
    supportsWrite: boolean;
    supportsSync: boolean;
    supportsIncrementalSync: boolean;
    supportsSchema: boolean;
  };
  operationStatus: Record<string, ConnectorOperationCapability>;
  partialOperations?: Record<string, string>;
}

export interface Connector {
  readonly name: string;
  execute(payload: ConnectorPayload): Promise<ConnectorResult>;
  testConnection(
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }>;
  getCapabilities?(): ConnectorCapabilities;
  getSchema?(payload: ConnectorPayload): Promise<ConnectorResult>;
  sync?(payload: ConnectorPayload, mode: string): Promise<ConnectorResult>;
}
