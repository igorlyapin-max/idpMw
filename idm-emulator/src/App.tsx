import { useState } from 'react';
import { useEmulatorStore } from './stores/emulatorStore';
import { ConnectionPanel } from './components/ConnectionPanel';
import { OperationSelector } from './components/OperationSelector';
import { PayloadEditor } from './components/PayloadEditor';
import { ResponseViewer } from './components/ResponseViewer';
import { OperationLog } from './components/OperationLog';
import { ContractTestRunner } from './components/ContractTestRunner';
import { buildEvent, sendWebhookEvent } from './api/idmClient';
import type { WebhookResponse } from './types/idm.types';
import './App.css';

function App() {
  const store = useEmulatorStore();
  const [lastResponse, setLastResponse] = useState<WebhookResponse | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    setError(null);
    setLastResponse(undefined);

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(store.payload);
    } catch {
      setError('Invalid JSON in payload editor');
      return;
    }

    const start = Date.now();
    const event = buildEvent(
      store.selectedOperation,
      store.targetSystem,
      payload,
    );

    try {
      const response = await sendWebhookEvent(event);
      setLastResponse(response);
      store.recordResponse(
        store.selectedOperation,
        store.targetSystem,
        event,
        response,
        start,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      store.recordResponse(
        store.selectedOperation,
        store.targetSystem,
        event,
        { received: false, processed: false, data: message },
        start,
      );
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>IDM Emulator</h1>
        <p>Generate and verify every Avanpost IDM operation against idmMw</p>
      </header>

      <main className="app-main">
        <div className="app-sidebar">
          <ConnectionPanel store={store} />
          <OperationSelector store={store} />
          <ContractTestRunner store={store} />
        </div>

        <div className="app-content">
          <PayloadEditor store={store} />

          <div className="actions">
            <button onClick={handleSend}>Send Operation</button>
            <button onClick={store.clearLog} className="secondary">
              Clear Log
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <ResponseViewer response={lastResponse} />
          <OperationLog entries={store.log} />
        </div>
      </main>
    </div>
  );
}

export default App;
