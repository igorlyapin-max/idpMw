import { useEffect, useState, useCallback } from 'react';
import { fetchDlqItems, retryDlqItem, skipDlqItem, type DlqItem } from '../api/client';
import { DlqTable } from '../components/DlqTable';

export function DlqPage() {
  const [items, setItems] = useState<DlqItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchDlqItems({
        status: statusFilter || undefined,
        limit: 50,
      });
      setItems(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRetry = async (id: string) => {
    await retryDlqItem(id);
    await load();
  };

  const handleSkip = async (id: string) => {
    await skipDlqItem(id);
    await load();
  };

  const exportCsv = () => {
    const headers = ['id', 'eventId', 'operation', 'targetSystem', 'status', 'error', 'retryCount', 'createdAt'];
    const rows = items.map((i) =>
      [i.id, i.eventId, i.operation, i.targetSystem, i.status, i.error, String(i.retryCount), i.createdAt].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dlq-export-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>DLQ Admin</h1>

      <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <label>
          Status:{" "}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="retrying">Retrying</option>
            <option value="skipped">Skipped</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <button onClick={load} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        <button onClick={exportCsv}>Export CSV</button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <DlqTable items={items} onRetry={handleRetry} onSkip={handleSkip} />
    </div>
  );
}
