import type { ReactNode } from 'react';
import { plates as text } from '../../../i18n/plates';
import { BLOCKS, blockDescription, blockTitle, type BlockCategory } from '../graph/nodes';
import type { BlockType } from '../graph/types';

const ORDER: BlockCategory[] = ['image', 'binary', 'plate', 'view'];

/**
 * The block palette. Click adds a block in front of "Wynik" (or into the selected wire);
 * dragging it onto a wire inserts it there; dropping it elsewhere places it freely.
 */
export function Palette({
  blocks,
  onAdd,
  top,
}: {
  top?: ReactNode;
  blocks: BlockType[];
  onAdd: (type: BlockType, element: HTMLElement) => void;
}) {
  const t = text.editor;
  return (
    <aside className="palette" aria-label={t.palette}>
      {top}
      <h2>{t.palette}</h2>
      <p className="palette-hint">{t.paletteHint}</p>
      {ORDER.map((category) => {
        const items = blocks.filter((type) => BLOCKS[type].category === category);
        if (!items.length) return null;
        return (
          <section key={category}>
            <h3>{t.categories[category as keyof typeof t.categories]}</h3>
            <ul>
              {items.map((type) => (
                <li key={type}>
                  <button
                    className={`palette-item block-${BLOCKS[type].category}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/x-plate-block', type);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={(event) => onAdd(type, event.currentTarget)}
                    title={`${blockDescription(type)} (${BLOCKS[type].opencv})`}
                  >
                    <span className="block-icon" aria-hidden="true">
                      {BLOCKS[type].icon}
                    </span>
                    <span>
                      <strong>{blockTitle(type)}</strong>
                      <small>{blockDescription(type)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </aside>
  );
}
