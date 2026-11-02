import { useState, type ReactElement } from "react";
import { NavLink } from "react-router-dom";
import { campaignAction, type CampaignDetail, type CampaignSummary, type Contact, type ContactStatus, type Sender } from "../../lib/marketingApi";
import { ConfirmDialog } from "../../components/ConfirmDialog";

export const STATUS: Record<ContactStatus, [string, string]> = {
  new: ["Ready", ""], cold: ["Cold", "warn"], waiting: ["Waiting for reply", "warn"], opted: ["Opted in", "good"], signed: ["Signed up", "good"],
  paused: ["Paused", "warn"], snoozed: ["Snoozed", ""], closed: ["Closed", ""], finished: ["Finished", ""], suppressed: ["Do not email", "bad"],
};

export const CAMPAIGN_STATUS: Record<CampaignSummary["status"], [string, string]> = {
  draft: ["Draft", ""], active: ["Live", "good"], paused: ["Paused", "warn"],
};

const SENDABLE: ContactStatus[] = ["new", "cold", "opted", "signed"];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

export const isDue = (c: Contact) => SENDABLE.includes(c.status) && c.next_email > 0 && !!c.next_date && c.next_date <= today();
export const fill = (text: string, c: { first_name: string; firm: string }) => text.replace(/\{\{FirstName\}\}/g, c.first_name).replace(/\{\{Firm\}\}/g, c.firm);
/** Plain paragraphs of an email's HTML, for snippets and AI briefs. Parsing here never runs anything. */
export function paragraphs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.body.querySelectorAll("p, li")].map((el) => (el.textContent ?? "").trim()).filter(Boolean);
}
export const nice = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—");
export const Pill = ({ s }: { s: ContactStatus }) => <span className={"pill " + STATUS[s][1]}>{STATUS[s][0]}</span>;
/** The pattern's name, or Custom once emails were added or removed. */
export function patternName(sender: Sender, key: string, emails: number): string {
  const pattern = sender.patterns.find((p) => p.key === key);
  return pattern && pattern.emails === emails ? pattern.name : "Custom pattern";
}

/** The two sides of email marketing, at the top of both list pages. */
export function EmailTabs(): ReactElement {
  const link = ({ isActive }: { isActive: boolean }) => "tab tablink" + (isActive ? " on" : "");
  return (
    <nav className="tabs" aria-label="Email">
      <NavLink to="/marketing/email" end className={link}>Campaigns</NavLink>
      <NavLink to="/marketing/email/templates" className={link}>Email templates</NavLink>
    </nav>
  );
}

/** What every tab of a campaign shares. */
export interface Ctx {
  c: CampaignDetail;
  sender: Sender;
  contacts: Contact[];
  run: (work: () => Promise<unknown>, done?: string) => Promise<boolean>;
  go: (tab: string, show?: string) => void;
  openContact: (c: Contact) => void;
}

/** Today's batch. A person approves every send: this bar is the only way emails leave. */
export function ApproveBar({ c, run, onShow }: Pick<Ctx, "c" | "run"> & { onShow?: () => void }): ReactElement | null {
  const [sending, setSending] = useState(false);
  const n = c.ready_today;
  if (n === 0) return null;
  if (c.status !== "active") return <p className="mk-note">{n} email{n > 1 ? "s are" : " is"} due, but this campaign isn’t live. Finish the launch checks first.</p>;
  return (
    <section className="check">
      <div>
        <h2>{n} email{n > 1 ? "s" : ""} ready to send</h2>
        <span className="k">Daily limit: {c.daily_limit}. Nothing goes out until you approve.</span>
      </div>
      <div className="fr">
        {onShow ? <button type="button" className="btn sm" onClick={onShow}>See who gets them</button> : null}
        <button type="button" className="btn sm dark" onClick={() => setSending(true)}>Approve and send</button>
      </div>
      {sending ? (
        <ConfirmDialog title={`Send ${n} email${n > 1 ? "s" : ""} now?`} confirmLabel="Approve and send" onClose={() => setSending(false)} onConfirm={async () => { await campaignAction(c.id, "send", { expected: n }); await run(async () => undefined, "Approved. Emails are going out one at a time."); }}>
          These are real emails to real people, sent one at a time from your outreach address.
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
