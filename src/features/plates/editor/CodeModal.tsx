import { useMemo, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { plates as text } from '../../../i18n/plates';
import { toPython } from '../graph/codegen';
import type { Graph } from '../graph/types';

/** "Pokaż kod": the current graph as read-only Python OpenCV code. */
export function CodeModal({ graph, onClose }: { graph: Graph; onClose: () => void }) {
  const code = useMemo(() => toPython(graph), [graph]);
  const [copied, setCopied] = useState(false);
  const t = text.editor;
  return (
    <Modal title={t.codeTitle} onClose={onClose}>
      <p className="note">{t.codeNote}</p>
      <pre className="plates-code" tabIndex={0}>
        <code>{code}</code>
      </pre>
      <div className="actions">
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setCopied(true);
          }}
        >
          {copied ? t.copied : t.copy}
        </button>
      </div>
    </Modal>
  );
}
