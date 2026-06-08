import { useEffect, useState, useCallback } from 'react';
import {
  fetchAdminStats,
  fetchDlqItems,
  fetchTargetSystems,
  retryDlqItem,
  retryDlqItems,
  skipDlqItem,
  type AdminStats,
  type DlqItem,
  type TargetSystem,
} from '../api/client';
import { DlqTable } from '../components/DlqTable';

const STATUS_OPTIONS = ['pending', 'retrying', 'skipped', 'resolved'];

function csvValue(value: unknown): string {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function DlqPage() {
  const [items, setItems] = useState<DlqItem[]>([]);
  const [targetSystems, setTargetSystems] = useState<TargetSystem[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [targetFilter, setTargetFilter] = useState('');
  const [retryLimit, setRetryLimit] = useState('25');
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, adminStats, targets] = await Promise.all([
        fetchDlqItems({
          status: statusFilter || undefined,
          targetSystem: targetFilter || undefined,
          limit: 50,
        }),
        fetchAdminStats(),
        fetchTargetSystems({ limit: 200 }),
      ]);
      setItems(data);
      setStats(adminStats);
      setTargetSystems(targets);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, targetFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const handleRetry = async (id: string) => {
    setMessage('');
    await retryDlqItem(id);
    await load();
  };

  const handleSkip = async (id: string) => {
    setMessage('');
    await skipDlqItem(id);
    await load();
  };

  const handleBulkRetry = async () => {
    setRetrying(true);
    setError('');
    setMessage('');
    try {
      const result = await retryDlqItems({
        status: statusFilter || 'pending',
        targetSystem: targetFilter || undefined,
        limit: Number(retryLimit) || 25,
      });
      setMessage(
        `Retry requested: ${result.requested}, queued: ${result.queued}, skipped: ${result.skipped}, errors: ${result.errors.length}`,
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRetrying(false);
    }
  };

  const exportCsv = () => {
    const headers = [
      'id',
      'eventId',
      'operation',
      'targetSystem',
      'status',
      'error',
      'retryCount',
      'createdAt',
    ];
    const rows = items.map((i) =>
      [
        i.id,
        i.eventId,
        i.operation,
        i.targetSystem,
        i.status,
        i.error,
        String(i.retryCount),
        i.createdAt,
      ]
        .map(csvValue)
        .join(','),
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
    <div className="page-shell">
      <div className="page-title-row">
        <h1>DLQ Admin</h1>
        <button className="button" onClick={load} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="status-strip">
        <div className="status-item">
          <span className="status-label">Pending</span>
          <span className="status-value">{stats?.dlq.pending ?? 0}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Retrying</span>
          <span className="status-value">{stats?.dlq.retrying ?? 0}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Skipped</span>
          <span className="status-value">{stats?.dlq.skipped ?? 0}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Resolved</span>
          <span className="status-value">{stats?.dlq.resolved ?? 0}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Processed 5m</span>
          <span className="status-value">
            {stats?.processedLast5Minutes.total ?? 0}
          </span>
        </div>
      </div>

      <div className="toolbar">
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target system
          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
          >
            <option value="">All</option>
            {targetSystems.map((target) => (
              <option key={target.id} value={target.name}>
                {target.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Retry limit
          <select
            value={retryLimit}
            onChange={(e) => setRetryLimit(e.target.value)}
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <button
          className="button primary"
          onClick={handleBulkRetry}
          disabled={retrying}
        >
          {retrying ? 'Retrying...' : 'Retry selected'}
        </button>
        <button className="button" onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      {message && <div className="message">{message}</div>}
      {error && <div className="error-text">{error}</div>}

      <DlqTable items={items} onRetry={handleRetry} onSkip={handleSkip} />
    </div>
  );
}
