/** Small pieces shared by the Templates page and its editor: the Language choice, the reply % chip, the bubble's
 * media card and the "Preview as" contact picker. */
import { useState, type ReactElement, type ReactNode } from "react";
import { Popover } from "../../../components/Popover";
import type { WaTemplate } from "../../../lib/whatsappApi";
import type { Seg } from "./templateBlocks";
import { band, type PreviewContact, type QuickPicks } from "./templateModel";

/** The Language dropdown in the page header: every card in English, Hinglish or both stacked. */
export type CardLang = "en" | "hi" | "both";
const LANG_KEY = "zinwe.admin.wa.templates.lang";
export function readCardLang(): CardLang {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    return v === "hi" || v === "both" ? v : "en";
  } catch {
    return "en";
  }
}
export function writeCardLang(v: CardLang): void {
  try {
    window.localStorage.setItem(LANG_KEY, v);
  } catch {
    /* private window: the choice lasts this visit only */
  }
}

export const pctText = (rate: number, sends: number): string => (sends ? `${rate} %` : "—");

export function Pct({ rate, sends, tip, quiet }: { rate: number; sends: number; tip?: string; quiet?: string }): ReactElement {
  return <span className={"wt-pct " + (quiet ? "is-none" : band(rate, sends))} title={tip}>{quiet ?? pctText(rate, sends)}</span>;
}

export function Segs({ segs, marks }: { segs: Seg[]; marks: boolean }): ReactElement {
  return <>{segs.map((s, i) => <span key={i} className={marks && s.kind ? `wt-seg is-${s.kind}` : undefined}>{s.t}</span>)}</>;
}

export const ICON = {
  video: "M5 3l14 9-14 9V3z",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01",
  card: "M20 12V8H4v4M2 8h20v4H2zM12 8v14M5 12v10h14V12",
};
export function Svg({ d, size = 18 }: { d: string; size?: number }): ReactElement {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

/** A picture or video shows as a card inside the bubble; an Offer shows its code. */
export function MediaCard({ t }: { t: WaTemplate }): ReactElement | null {
  if (t.media) {
    return <div className="wt-media"><Svg d={t.media.kind === "video" ? ICON.video : ICON.image} />{t.media.kind === "video" ? "Video" : "Picture"} · {t.media.name}</div>;
  }
  if (t.category === "offer" && t.coupon_info) {
    return <div className="wt-media is-card"><Svg d={ICON.card} />{t.coupon_info.code} · {t.coupon_info.percent_off} % off</div>;
  }
  return null;
}

/** "Preview as": a real contact, with quick picks for "no first name" and "no names", and a search. */
export function WhoPicker({ all, picks, value, onPick, children }: {
  all: PreviewContact[]; picks: QuickPicks; value: PreviewContact; onPick: (p: PreviewContact) => void; children?: (open: (el: HTMLElement) => void) => ReactNode;
}): ReactElement {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const quick = [picks.first, picks.noFirst, picks.noNames].filter((p): p is PreviewContact => !!p);
  const found = needle
    ? all.filter((p) => `${p.label} ${p.title} ${p.who.City}`.toLowerCase().includes(needle)).slice(0, 8)
    : quick;
  const pick = (p: PreviewContact) => {
    onPick(p);
    setAnchor(null);
    setQ("");
  };
  return (
    <>
      {children ? children(setAnchor) : (
        <button type="button" className="wt-sel" aria-haspopup="dialog" onClick={(e) => setAnchor(e.currentTarget)}>
          Preview as <b>{value.label}</b>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}
      {anchor ? (
        <Popover anchor={anchor} title="Preview as" width={340} onClose={() => setAnchor(null)}>
          <div className="wt-whopop">
            {all.length ? <input className="inp" type="search" placeholder="Search contacts" aria-label="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /> : <span className="k">No contacts yet: these are samples.</span>}
            <div className="wt-wholist">
              {found.length ? found.map((p) => (
                <button key={p.id} type="button" aria-pressed={p.id === value.id} onClick={() => pick(p)}>
                  {p.label}<small>{[p.title, p.who.City].filter(Boolean).join(" · ")}</small>
                </button>
              )) : <span className="k">No contact matches.</span>}
            </div>
          </div>
        </Popover>
      ) : null}
    </>
  );
}

