import type { ReactElement, ReactNode } from "react";
import type { AnnouncementKind } from "../lib/api";
import "../styles/moment-preview.css";

/**
 * The customer dashboard's pop-up, as owners see it (zinwe-frontend src/dashboard/components/Moments.tsx MomentPopup,
 * styles/dash13.css .zn-moment*): the picture on top (2:1), a small kind label, the title, one line, a black
 * full-width button and "Not now". Keep the two in step.
 */

/** The small label over the title, as the dashboard writes it. */
export const MOMENT_KIND_LABEL: Partial<Record<AnnouncementKind, string>> = {
  version: "New in Zinwe",
  news: "News",
  wish: "From the Zinwe team",
  offer: "Offer",
  discount: "Offer",
};

/** The dashboard's picture when staff didn't upload one: calm art per kind (white, black and orange only). */
export function MomentArt({ kind, className = "mp__art" }: { kind: AnnouncementKind; className?: string }): ReactElement {
  const offer = kind === "offer" || kind === "discount";
  const wish = kind === "wish";
  return (
    <svg className={className} viewBox="0 0 440 220" role="presentation" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <rect width="440" height="220" fill="#FFF6EE" />
      <circle cx="372" cy="40" r="90" fill="#FDEBDC" />
      <circle cx="58" cy="196" r="70" fill="#FDEBDC" />
      {offer ? (
        <g transform="translate(160 46)">
          <rect x="0" y="34" width="120" height="96" rx="14" fill="#141210" />
          <rect x="-8" y="16" width="136" height="30" rx="10" fill="#F26A0A" />
          <rect x="52" y="16" width="16" height="114" fill="#FFF6EE" opacity=".9" />
          <path d="M60 16c-14-22-40-20-38-4 2 12 24 8 38 4zm0 0c14-22 40-20 38-4-2 12-24 8-38 4z" fill="none" stroke="#F26A0A" strokeWidth="7" strokeLinejoin="round" />
          <text x="60" y="104" textAnchor="middle" fontFamily="Geist, Segoe UI, sans-serif" fontSize="34" fontWeight="700" fill="#FFFFFF">
            %
          </text>
        </g>
      ) : wish ? (
        <g transform="translate(170 60)">
          <path d="M50 8c10 16 18 26 18 40a18 18 0 0 1-36 0c0-14 8-24 18-40z" fill="#F26A0A" />
          <path d="M50 30c5 9 8 13 8 20a8 8 0 0 1-16 0c0-7 3-11 8-20z" fill="#FFD27A" />
          <path d="M0 92c14 34 86 34 100 0z" fill="#141210" />
          <rect x="-6" y="86" width="112" height="10" rx="5" fill="#141210" />
        </g>
      ) : (
        <g transform="translate(150 50)">
          <rect x="0" y="0" width="140" height="104" rx="14" fill="#FFFFFF" stroke="#141210" strokeWidth="5" />
          <rect x="18" y="22" width="60" height="10" rx="5" fill="#141210" />
          <rect x="18" y="44" width="104" height="8" rx="4" fill="#D4D4D4" />
          <rect x="18" y="60" width="84" height="8" rx="4" fill="#D4D4D4" />
          <circle cx="126" cy="4" r="20" fill="#F26A0A" />
          <path d="M126 -6v20M116 4h20" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

/** A still copy of the pop-up card (no dialog, nothing clickable): for previews. */
export function MomentPreview({
  kind,
  title,
  body,
  button,
  pictureSrc,
  close,
  children,
}: {
  kind: AnnouncementKind;
  title: string;
  body: string;
  /** The button text; empty = no button, and "Not now" reads "Got it". */
  button: string;
  pictureSrc: string | null;
  /** The second action's text (default "Not now" / "Got it"); "" hides it. */
  close?: string;
  /** Extra content between the text and the buttons (F-22: a coupon code, the 1-10 scale). */
  children?: ReactNode;
}): ReactElement {
  const later = close ?? (button ? "Not now" : "Got it");
  const label = MOMENT_KIND_LABEL[kind];
  return (
    <div className="mp" aria-hidden="true">
      <div className="mp__pic">
        {pictureSrc ? <img src={pictureSrc} alt="" /> : <MomentArt kind={kind} />}
        <span className="mp__x">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </span>
      </div>
      <div className="mp__body">
        {label ? <span className="mp__kind">{label}</span> : null}
        <b className={"mp__title" + (title.trim() ? "" : " is-empty")}>{title.trim() || "Your title"}</b>
        {body.trim() ? <p>{body.trim()}</p> : null}
        {children}
        <div className="mp__acts">
          {button ? <span className="mp__go">{button}</span> : null}
          {later ? <span className="mp__later">{later}</span> : null}
        </div>
      </div>
    </div>
  );
}
