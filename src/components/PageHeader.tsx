import type { ReactElement, ReactNode } from "react";
import { Icon } from "./icons";

/**
 * The board page header: title 26 px, one plain-English line under it (max 72ch), actions on the right
 * (wrap under on phones). `onReload` adds the board's Refresh button.
 */
export function PageHeader({
  title,
  subtitle,
  onReload,
  pending,
  children,
  badge,
  eyebrow,
}: {
  /** A small line above the title, e.g. today's date. */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  onReload?: () => void;
  pending?: boolean;
  children?: ReactNode;
  /** Shown beside the title (e.g. <SampleTag/>). */
  badge?: ReactNode;
}): ReactElement {
  return (
    <header className="phead">
      <div className="phead__text">
        {eyebrow ? <span className="k phead__eyebrow">{eyebrow}</span> : null}
        <h1 className="phead__title">
          {title}
          {badge}
        </h1>
        {subtitle ? <p className="phead__sub">{subtitle}</p> : null}
      </div>
      {children || onReload ? (
        <div className="phead__actions">
          {children}
          {onReload ? (
            <button type="button" className="btn" onClick={onReload} disabled={pending}>
              <Icon name="refresh" />
              {pending ? "Refreshing" : "Refresh"}
            </button>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
