import type { EmulatorStore } from '../stores/emulatorStore';

const TARGET_SYSTEMS = ['fake', 'zabbix', 'cmdbuild', 'rest', 'db'];

export function ConnectionPanel({ store }: { store: EmulatorStore }) {
  return (
    <section className="connection-panel">
      <h2>Connection</h2>
      <div className="connection-fields">
        <label>
          <span>Middleware URL</span>
          <input
            type="url"
            value={store.baseUrl}
            onChange={(e) => store.setBaseUrl(e.target.value)}
            placeholder="http://localhost:3010"
          />
        </label>
        <label>
          <span>Target System</span>
          <select
            value={store.targetSystem}
            onChange={(e) => store.setTargetSystem(e.target.value)}
          >
            {TARGET_SYSTEMS.map((ts) => (
              <option key={ts} value={ts}>
                {ts}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
