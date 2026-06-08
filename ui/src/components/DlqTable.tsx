import type { DlqItem } from '../api/client';

interface Props {
  items: DlqItem[];
  onRetry: (id: string) => void;
  onSkip: (id: string) => void;
}

export function DlqTable({ items, onRetry, onSkip }: Props) {
  if (items.length === 0) {
    return <div className="empty-state">DLQ is empty</div>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Event ID</th>
          <th>Operation</th>
          <th>Target</th>
          <th>Status</th>
          <th>Error</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td className="mono" title={item.eventId}>
              {item.eventId}
            </td>
            <td>{item.operation}</td>
            <td>{item.targetSystem}</td>
            <td>
              <span className={`badge ${item.status}`}>{item.status}</span>
            </td>
            <td className="truncate" title={item.error}>
              {item.error}
            </td>
            <td className="mono">
              {new Date(item.createdAt).toLocaleString()}
            </td>
            <td>
              {item.status === 'pending' || item.status === 'retrying' ? (
                <>
                  <div className="actions">
                    <button
                      className="button small"
                      onClick={() => onRetry(item.id)}
                    >
                      Retry
                    </button>
                    <button
                      className="button danger small"
                      onClick={() => onSkip(item.id)}
                    >
                      Skip
                    </button>
                  </div>
                </>
              ) : (
                <span className="mono">-</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
