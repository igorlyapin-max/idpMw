import {
  OPERATION_CATEGORIES,
  isReadOperation,
  type AvanpostOperation,
} from '../types/idm.types';
import { buildEvent, sendWebhookEvent, getTargetSystem } from '../api/idmClient';
import { getPayloadTemplate } from '../operations';
import type { EmulatorStore } from '../stores/emulatorStore';

const ALL_OPERATIONS: AvanpostOperation[] = Object.values(OPERATION_CATEGORIES).flat();

export function ContractTestRunner({ store }: { store: EmulatorStore }) {
  const runContractTest = async () => {
    store.setRunning(true);
    store.clearLog();

    let targetConfig: Record<string, unknown> | undefined;
    if (store.targetSystem !== 'fake') {
      const ts = await getTargetSystem(store.targetSystem);
      if (ts) {
        targetConfig = ts.config;
      }
    }

    for (const operation of ALL_OPERATIONS) {
      const start = Date.now();
      const template = getPayloadTemplate(operation);
      const payload: Record<string, unknown> = isReadOperation(operation)
        ? { params: template.params ?? {} }
        : { data: template.data ?? {}, params: template.params ?? {} };

      if (targetConfig) {
        payload.config = targetConfig;
      }

      const event = buildEvent(operation, store.targetSystem, payload);

      try {
        const response = await sendWebhookEvent(event);
        store.recordResponse(operation, store.targetSystem, event, response, start);
      } catch (err) {
        store.recordResponse(
          operation,
          store.targetSystem,
          event,
          {
            received: true,
            processed: false,
            data: err instanceof Error ? err.message : String(err),
          },
          start,
        );
      }
    }

    store.setRunning(false);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(store.log, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contract-test-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const headers = 'operation,targetSystem,success,durationMs,timestamp';
    const rows = store.log.map(
      (e) => `${e.operation},${e.targetSystem},${e.success},${e.durationMs},${e.timestamp}`
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contract-test-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const results = {
    total: store.log.length,
    passed: store.log.filter((e) => e.success).length,
    failed: store.log.filter((e) => !e.success).length,
  };

  return (
    <section className="contract-test-runner">
      <h2>Contract Test</h2>
      <button onClick={runContractTest} disabled={store.running}>
        {store.running ? 'Running…' : 'Run Contract Test'}
      </button>
      {store.log.length > 0 && (
        <div className="contract-results">
          <span>Total: {results.total}</span>
          <span className="passed">Passed: {results.passed}</span>
          <span className="failed">Failed: {results.failed}</span>
          <button onClick={exportJson} className="secondary">Export JSON</button>
          <button onClick={exportCsv} className="secondary">Export CSV</button>
        </div>
      )}
    </section>
  );
}
