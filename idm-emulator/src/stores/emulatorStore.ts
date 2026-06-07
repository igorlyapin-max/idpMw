import { useState, useCallback } from 'react';
import type { AvanpostOperation, OperationLogEntry, WebhookResponse } from '../types/idm.types';

export interface EmulatorState {
  baseUrl: string;
  targetSystem: string;
  selectedOperation: AvanpostOperation;
  payload: string;
  log: OperationLogEntry[];
  running: boolean;
}

export function useEmulatorStore() {
  const [baseUrl, setBaseUrl] = useState('http://localhost:3010');
  const [targetSystem, setTargetSystem] = useState('fake');
  const [selectedOperation, setSelectedOperation] = useState<AvanpostOperation>('user.create');
  const [payload, setPayload] = useState('{}');
  const [log, setLog] = useState<OperationLogEntry[]>([]);
  const [running, setRunning] = useState(false);

  const appendLog = useCallback((entry: OperationLogEntry) => {
    setLog((prev) => [entry, ...prev]);
  }, []);

  const clearLog = useCallback(() => {
    setLog([]);
  }, []);

  const recordResponse = useCallback(
    (
      operation: AvanpostOperation,
      targetSystem: string,
      request: unknown,
      response: WebhookResponse,
      start: number,
    ) => {
      appendLog({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        operation,
        targetSystem,
        request,
        response,
        durationMs: Date.now() - start,
        success: response.processed,
      });
    },
    [appendLog],
  );

  return {
    baseUrl,
    setBaseUrl,
    targetSystem,
    setTargetSystem,
    selectedOperation,
    setSelectedOperation,
    payload,
    setPayload,
    log,
    appendLog,
    clearLog,
    running,
    setRunning,
    recordResponse,
  };
}

export type EmulatorStore = ReturnType<typeof useEmulatorStore>;
