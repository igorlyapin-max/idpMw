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

export interface Connector {
  readonly name: string;
  execute(payload: ConnectorPayload): Promise<ConnectorResult>;
  testConnection(
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }>;
}
