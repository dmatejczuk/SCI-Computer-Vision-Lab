import { useEffect, useState } from 'react';
export function Snackbar({ message }: { message: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(!!message);
    const timer = setTimeout(() => setVisible(false), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <div className="snackbar" role="status" aria-live="polite" hidden={!visible}>
      <span>{message}</span>
      <button aria-label="Zamknij powiadomienie" onClick={() => setVisible(false)}>
        ×
      </button>
    </div>
  );
}
