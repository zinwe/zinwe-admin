import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";
import { ApiError } from "../../../lib/api";
import type { WaContact, WaKind, WaStatus } from "../../../lib/whatsappApi";

export const WA_STATUS: Record<WaStatus, [string, string]> = {
  ready: ["Ready", ""], messaged: ["Messaged", "warn"], replied: ["Replied", "warn"], interested: ["Interested", "good"],
  signed: ["Signed up", "good"], notnow: ["Not now", ""], stop: ["Do not message", "bad"],
};
export const KIND_LABEL: Record<WaKind, string> = {
  first: "First message", followup: "Follow-up", interested: "Reply: interested", question: "Reply: question", notnow: "Reply: not now",
};
export const WaPill = ({ s }: { s: WaStatus }): ReactElement => <span className={"pill " + WA_STATUS[s][1]}>{WA_STATUS[s][0]}</span>;
export const errText = (err: unknown, fallback: string): string => (err instanceof ApiError ? err.message : fallback);
export const nameOf = (c: Pick<WaContact, "first_name" | "info" | "firm">): string => c.info?.contact_name || c.first_name || c.firm;
export const initials = (s: string): string =>
  s.replace(/^Dr\.? /i, "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
export const when = (iso: string | null | undefined): string =>
  iso ? new Date(iso.length > 10 ? iso : `${iso}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

/** The WhatsApp tabs, shared by every WhatsApp page. */
export function WaTabs({ count }: { count?: number }): ReactElement {
  const link = ({ isActive }: { isActive: boolean }) => "tab tablink" + (isActive ? " on" : "");
  return (
    <nav className="tabs" aria-label="WhatsApp">
      <NavLink to="/marketing/whatsapp" end className={link}>Today{count ? <em className="wa-count">{count}</em> : null}</NavLink>
      <NavLink to="/marketing/whatsapp/contacts" className={link}>Contacts</NavLink>
      <NavLink to="/marketing/whatsapp/campaigns" className={link}>Campaigns</NavLink>
      <NavLink to="/marketing/whatsapp/templates" className={link}>Templates</NavLink>
      <NavLink to="/marketing/whatsapp/analytics" className={link}>Analytics</NavLink>
      <NavLink to="/marketing/whatsapp/settings" className={link}>Settings</NavLink>
    </nav>
  );
}

/** A message the way it lands in a WhatsApp chat. */
export function Bubble({ text, mine = true, meta }: { text: string; mine?: boolean; meta?: string }): ReactElement {
  return (
    <div className={"wa-bub" + (mine ? " me" : "")}>
      {text}
      {meta ? <small>{meta}</small> : null}
    </div>
  );
}
