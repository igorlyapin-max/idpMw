import { OPERATION_CATEGORIES } from '../types/idm.types';
import type { AvanpostOperation } from '../types/idm.types';
import type { EmulatorStore } from '../stores/emulatorStore';
import { getPayloadTemplate } from '../operations';

export function OperationSelector({ store }: { store: EmulatorStore }) {
  const handleChange = (op: AvanpostOperation) => {
    store.setSelectedOperation(op);
    const template = getPayloadTemplate(op);
    store.setPayload(JSON.stringify(template, null, 2));
  };

  return (
    <section className="operation-selector">
      <h2>Operation</h2>
      <select
        value={store.selectedOperation}
        onChange={(e) => handleChange(e.target.value as AvanpostOperation)}
      >
        {Object.entries(OPERATION_CATEGORIES).map(([category, ops]) => (
          <optgroup key={category} label={category}>
            {ops.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </section>
  );
}
