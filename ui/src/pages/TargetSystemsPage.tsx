import { useState, useEffect, useCallback } from 'react';
import {
  fetchTargetSystems,
  createTargetSystem,
  updateTargetSystem,
  deleteTargetSystem,
  testTargetSystemConnection,
  type TargetSystem,
} from '../api/client';

const TYPE_OPTIONS = ['zabbix', 'cmdbuild', 'rest', 'db'];

export function TargetSystemsPage() {
  const [items, setItems] = useState<TargetSystem[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<{
    id?: string;
    name: string;
    type: string;
    label: string;
    config: string;
    enabled: boolean;
  }>({ name: '', type: 'zabbix', label: '', config: '{}', enabled: true });
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTargetSystems();
      setItems(data);
    } catch (e: unknown) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm({ name: '', type: 'zabbix', label: '', config: '{}', enabled: true });
    setEditing(false);
    setMessage('');
  };

  const handleSave = async () => {
    try {
      const config = JSON.parse(form.config);
      if (editing && form.id) {
        await updateTargetSystem(form.id, {
          name: form.name,
          type: form.type,
          label: form.label,
          config,
          enabled: form.enabled,
        });
        setMessage('Updated successfully');
      } else {
        await createTargetSystem({
          name: form.name,
          type: form.type,
          label: form.label,
          config,
          enabled: form.enabled,
        });
        setMessage('Created successfully');
      }
      resetForm();
      await load();
    } catch (e: unknown) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleEdit = (item: TargetSystem) => {
    setForm({
      id: item.id,
      name: item.name,
      type: item.type,
      label: item.label,
      config: JSON.stringify(item.config, null, 2),
      enabled: item.enabled,
    });
    setEditing(true);
    setMessage('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    try {
      await deleteTargetSystem(id);
      setMessage('Deleted successfully');
      await load();
    } catch (e: unknown) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleTest = async (id: string) => {
    try {
      const result = await testTargetSystemConnection(id);
      setMessage(result.message);
    } catch (e: unknown) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Target Systems</h1>
      {message && (
        <div style={{ marginBottom: '1rem', padding: '0.5rem', background: '#eee' }}>{message}</div>
      )}

      <div style={{ marginBottom: '1rem', border: '1px solid #ccc', padding: '1rem' }}>
        <h3>{editing ? 'Edit' : 'Create'} Target System</h3>
        <div style={{ display: 'grid', gap: '0.5rem', maxWidth: '400px' }}>
          <input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            placeholder="Label"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <textarea
            placeholder="Config JSON"
            rows={6}
            value={form.config}
            onChange={(e) => setForm({ ...form, config: e.target.value })}
          />
          <label>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <div>
            <button onClick={handleSave}>{editing ? 'Update' : 'Create'}</button>
            {editing && (
              <button onClick={resetForm} style={{ marginLeft: '0.5rem' }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <button onClick={load} disabled={loading}>
        {loading ? 'Loading...' : 'Refresh'}
      </button>

      <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc' }}>
            <th style={{ textAlign: 'left' }}>Name</th>
            <th style={{ textAlign: 'left' }}>Type</th>
            <th style={{ textAlign: 'left' }}>Label</th>
            <th style={{ textAlign: 'left' }}>Enabled</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{item.name}</td>
              <td>{item.type}</td>
              <td>{item.label}</td>
              <td>{item.enabled ? 'Yes' : 'No'}</td>
              <td>
                <button onClick={() => handleTest(item.id)}>Test</button>
                <button onClick={() => handleEdit(item)} style={{ marginLeft: '0.25rem' }}>
                  Edit
                </button>
                <button onClick={() => handleDelete(item.id)} style={{ marginLeft: '0.25rem' }}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
