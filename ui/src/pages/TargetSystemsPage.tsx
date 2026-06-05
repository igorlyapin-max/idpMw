import { useState, useEffect, useCallback } from 'react';
import {
  fetchTargetSystems,
  createTargetSystem,
  updateTargetSystem,
  deleteTargetSystem,
  testTargetSystemConnection,
  type TargetSystem,
} from '../api/client';

const TYPE_OPTIONS = ['zabbix', 'cmdbuild', 'rest', 'db', 'fake'];

interface ConfigField {
  name: string;
  label: string;
}

const TYPE_FIELDS: Record<string, ConfigField[]> = {
  zabbix: [
    { name: 'baseUrl', label: 'Base URL' },
    { name: 'username', label: 'Username' },
    { name: 'code', label: 'Access code' },
    { name: 'apiVersion', label: 'API Version (optional)' },
  ],
  cmdbuild: [
    { name: 'baseUrl', label: 'Base URL' },
    { name: 'username', label: 'Username' },
    { name: 'code', label: 'Access code' },
    { name: 'className', label: 'Class Name (optional)' },
  ],
  rest: [
    { name: 'baseUrl', label: 'Base URL (optional)' },
  ],
  db: [
    { name: 'client', label: 'Dialect (pg | mysql2 | sqlite3)' },
    { name: 'connection', label: 'Connection String' },
  ],
  fake: [
    { name: 'baseUrl', label: 'Base URL' },
    { name: 'apiKey', label: 'API Key (optional)' },
    { name: 'timeout', label: 'Timeout ms (optional)' },
  ],
};

function parseConfig(type: string, raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    const cfg: Record<string, unknown> = {};
    TYPE_FIELDS[type]?.forEach((f) => {
      cfg[f.name] = '';
    });
    return cfg;
  }
}

function buildConfig(type: string, values: Record<string, string>): string {
  const cfg: Record<string, unknown> = {};
  TYPE_FIELDS[type]?.forEach((f) => {
    if (values[f.name] !== undefined && values[f.name] !== '') {
      cfg[f.name] = values[f.name];
    }
  });
  return JSON.stringify(cfg, null, 2);
}

export function TargetSystemsPage() {
  const [items, setItems] = useState<TargetSystem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    id?: string;
    name: string;
    type: string;
    label: string;
    configValues: Record<string, string>;
    enabled: boolean;
  }>({ name: '', type: 'zabbix', label: '', configValues: {}, enabled: true });
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
    setForm({ name: '', type: 'zabbix', label: '', configValues: {}, enabled: true });
    setEditing(false);
    setMessage('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = parseConfig(form.type, buildConfig(form.type, form.configValues));
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
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: TargetSystem) => {
    const cfgValues: Record<string, string> = {};
    Object.entries(item.config as Record<string, unknown>).forEach(([k, v]) => {
      cfgValues[k] = String(v ?? '');
    });
    setForm({
      id: item.id,
      name: item.name,
      type: item.type,
      label: item.label,
      configValues: cfgValues,
      enabled: item.enabled,
    });
    setEditing(true);
    setMessage('');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    setDeletingId(id);
    try {
      await deleteTargetSystem(id);
      setMessage('Deleted successfully');
      await load();
    } catch (e: unknown) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testTargetSystemConnection(id);
      setMessage(result.message);
    } catch (e: unknown) {
      setMessage(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTestingId(null);
    }
  };

  const currentFields = TYPE_FIELDS[form.type] ?? [];

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
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, configValues: {} })}>
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
          {currentFields.map((f) => (
            <input
              key={f.name}
              type="text"
              placeholder={f.label}
              value={form.configValues[f.name] ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  configValues: { ...form.configValues, [f.name]: e.target.value },
                })
              }
            />
          ))}
          <label>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enabled
          </label>
          <div>
            <button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
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
                <button onClick={() => handleTest(item.id)} disabled={testingId === item.id}>
                  {testingId === item.id ? 'Testing...' : 'Test'}
                </button>
                <button onClick={() => handleEdit(item)} style={{ marginLeft: '0.25rem' }}>
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  style={{ marginLeft: '0.25rem' }}
                >
                  {deletingId === item.id ? 'Deleting...' : 'Delete'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
