import type { DlqItem } from '../api/client';

interface Props {
  items: DlqItem[];
  onRetry: (id: string) => void;
  onSkip: (id: string) => void;
}

export function DlqTable({ items, onRetry, onSkip }: Props) {
  if (items.length === 0) {
    return <p>DLQ is empty</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #ccc' }}>
          <th style={{ textAlign: 'left', padding: '8px' }}>Event ID</th>
          <th style={{ textAlign: 'left', padding: '8px' }}>Operation</th>
          <th style={{ textAlign: 'left', padding: '8px' }}>Target</th>
          <th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
          <th style={{ textAlign: 'left', padding: '8px' }}>Error</th>
          <th style={{ textAlign: 'left', padding: '8px' }}>Created</th>
          <th style={{ textAlign: 'left', padding: '8px' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '8px', fontSize: '0.85rem' }}>{item.eventId}</td>
            <td style={{ padding: '8px' }}>{item.operation}</td>
            <td style={{ padding: '8px' }}>{item.targetSystem}</td>
            <td style={{ padding: '8px' }}>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor:
                    item.status === 'pending'
                      ? '#fff3cd'
                      : item.status === 'resolved'
                        ? '#d4edda'
                        : item.status === 'skipped'
                          ? '#f8d7da'
                          : '#e2e3e5',
                }}
              >
                {item.status}
              </span>
            </td>
            <td style={{ padding: '8px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.error}
            </td>
            <td style={{ padding: '8px', fontSize: '0.85rem' }}>
              {new Date(item.createdAt).toLocaleString()}
            </td>
            <td style={{ padding: '8px' }}>
              {item.status === 'pending' && (
                <>
                  <button onClick={() => onRetry(item.id)} style={{ marginRight: '4px' }}>
                    Retry
                  </button>
                  <button onClick={() => onSkip(item.id)}>Skip</button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
