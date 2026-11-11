import type { ReactNode } from 'react';
import { SCI_WEBSITE_URL } from '../../config/branding';
import { pl } from '../../i18n/pl';
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header>
      <div className="brand">
        <a
          className="brand-mark"
          href={SCI_WEBSITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={pl.sciWebsite}
        >
          SCI<span>_</span>
        </a>
        <span>
          {pl.brand}
          <small>{pl.school}</small>
        </span>
      </div>
      {children ?? <div className="workshop-tag">{pl.workshop}</div>}
    </header>
  );
}
