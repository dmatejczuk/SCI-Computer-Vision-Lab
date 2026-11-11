import { useRef } from 'react';
export function PairingCodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const update = (index: number, text: string) => {
    const clean = text
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, '')
      .slice(0, 6 - index);
    const chars = value.padEnd(6, ' ').split('');
    for (let i = 0; i < clean.length; i++) chars[index + i] = clean[i];
    if (!clean) chars[index] = ' ';
    onChange(chars.join('').trimEnd());
    if (clean) inputs.current[Math.min(index + clean.length, 5)]?.focus();
  };
  return (
    <fieldset className="code-entry">
      <legend>Kod ze stanowiska</legend>
      <div>
        {Array.from({ length: 6 }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            aria-label={`Znak ${i + 1} kodu`}
            value={value[i]?.trim() || ''}
            maxLength={6}
            autoCapitalize="characters"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            spellCheck={false}
            onFocus={(e) => e.target.select()}
            onChange={(e) => update(i, e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              update(i, e.clipboardData.getData('text'));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !value[i]?.trim() && i > 0)
                inputs.current[i - 1]?.focus();
              if (e.key === 'ArrowLeft') inputs.current[Math.max(0, i - 1)]?.focus();
              if (e.key === 'ArrowRight') inputs.current[Math.min(5, i + 1)]?.focus();
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}
