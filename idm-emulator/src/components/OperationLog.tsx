import type { OperationLogEntry } from '../types/idm.types';

export function OperationLog({ entries }: { entries: OperationLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <section className="operation-log">
        <h2>Operation Log</h2>
        <p className="empty-log">No operations yet.</p>
      </section>
    );
  }

  return (
    <section className="operation-log">
      <h2>Operation Log</h2>
      <ul className="log-list">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`log-item ${entry.success ? 'success' : 'failure'}`}
          >
            <div className="log-header">
              <span className="log-operation">{entry.operation}</span>
              <span className="log-target">{entry.targetSystem}</span>
              <span className={`log-status ${entry.success ? 'success' : 'failure'}`}>
                {entry.success ? 'OK' : 'FAIL'}
              </span>
              <span className="log-duration">{entry.durationMs}ms</span>
            </div>
            <details>
              <summary>Request / Response</summary>
              <pre className="log-detail">
                {JSON.stringify(
                  {
                    request: entry.request,
                    response: entry.response,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
