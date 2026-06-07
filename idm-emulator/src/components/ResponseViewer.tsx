import Editor from '@monaco-editor/react';
import type { WebhookResponse } from '../types/idm.types';

export function ResponseViewer({ response }: { response?: WebhookResponse }) {
  const value = response ? JSON.stringify(response, null, 2) : '// Send a request to see the response';

  return (
    <section className="response-viewer">
      <h2>Response</h2>
      <Editor
        height="200px"
        defaultLanguage="json"
        value={value}
        options={{
          readOnly: true,
          minimap: { enabled: false },
        }}
      />
    </section>
  );
}
