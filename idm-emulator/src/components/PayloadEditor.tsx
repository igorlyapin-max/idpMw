import Editor from '@monaco-editor/react';
import type { EmulatorStore } from '../stores/emulatorStore';

export function PayloadEditor({ store }: { store: EmulatorStore }) {
  return (
    <section className="payload-editor">
      <h2>Payload</h2>
      <Editor
        height="300px"
        defaultLanguage="json"
        value={store.payload}
        onChange={(value) => store.setPayload(value ?? '{}')}
        options={{
          minimap: { enabled: false },
          formatOnPaste: true,
          formatOnType: true,
        }}
      />
    </section>
  );
}
