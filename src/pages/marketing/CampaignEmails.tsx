import { useEffect, useState, type ReactElement } from "react";
import { ApiError } from "../../lib/api";
import { addEmail, campaignAction, getAudience, getPersona, getTemplates, removeEmail, saveAsTemplate, saveEmail, useTemplate, type EmailTemplate } from "../../lib/marketingApi";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { paragraphs, type Ctx } from "./campaignShared";
import { audienceBrief } from "./data";
import { EmailPreview } from "./EmailPreview";
import { EmailBodyEditor, useCopy } from "./fields";

const RULES = [
  ["Yes", "Opted in", "good", "Save the reply as proof and send the next email"],
  ["Signed up, no reply", "Signed up", "good", "Setup emails only; Email 5 asks for a “yes”"],
  ["Installed", "No change", "", "Skip the first setup emails"],
  ["No reply after Email 2", "Closed", "", "Stop, no more emails"],
  ["Not now", "Snoozed", "warn", "Stop; check back once only if they agree to a date"],
  ["Question", "Paused", "warn", "Wait until you reply personally"],
  ["Out of office", "No change", "", "Flow continues"],
  ["No or unsubscribe", "Do not email", "bad", "Block the same day, never add back"],
  ["Hard bounce", "Do not email", "bad", "Block and check the address"],
  ["Spam complaint", "Do not email", "bad", "Block and pause all sending"],
  ["Wrong person", "Do not email", "bad", "Add someone only if they name the right contact"],
];

/** Pick a template to copy in. Emails 1–2 list Cold ones; later emails list the rest. */
function TemplatePicker({ title, subtitle, cold, blank, onPick, onClose }: { title: string; subtitle: string; cold: boolean; blank?: boolean; onPick: (id?: number) => void; onClose: () => void }): ReactElement {
  const [rows, setRows] = useState<EmailTemplate[] | null>(null);
  useEffect(() => { void getTemplates().then(setRows).catch(() => setRows([])); }, []);
  const list = (rows ?? []).filter((t) => (t.kind === "Cold") === cold);
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>Cancel</button>}>
      <div className="mk tpick">
        {blank ? <button type="button" className="patc" onClick={() => onPick()}><b>Blank email</b><span>Start with an empty email.</span></button> : null}
        {list.map((t) => (
          <button key={t.id} type="button" className="patc" onClick={() => onPick(t.id)}>
            <b>{t.name}</b><span>{t.subject}</span><small>{t.kind}</small>
          </button>
        ))}
        {rows && !list.length && !blank ? <p className="k">No {cold ? "Cold" : "matching"} templates yet. Add one in Email templates.</p> : null}
      </div>
    </Modal>
  );
}

function SaveAsTemplate({ c, n, start, onClose }: { c: Ctx["c"]; n: number; start: string; onClose: () => void }): ReactElement {
  const toast = useToast();
  const [name, setName] = useState(start);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveAsTemplate(c.id, n, name);
      toast("Saved to Email templates.");
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "bad");
      setBusy(false);
    }
  };
  return (
    <Modal title="Save as template" subtitle="This copies the email into Email templates. This campaign keeps its own copy." size="small" onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn dark" disabled={busy || !name.trim()} onClick={() => void save()}>Save template</button></>}>
      <div className="mk mk-imp">
        <label className="fl">Template name<input className="inp" autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
      </div>
    </Modal>
  );
}

export function EmailsTab({ c, sender, contacts, run }: Ctx): ReactElement {
  const toast = useToast();
  const { copy, dialog } = useCopy(toast);
  const [n, setN] = useState(1);
  const step = c.emails.find((e) => e.n === n) ?? c.emails[0];
  const [subject, setSubject] = useState(step?.subject ?? "");
  const [body, setBody] = useState(step?.body ?? "");
  const [base, setBase] = useState(step?.body ?? ""); // the text as the editor loaded it, so an untouched email isn't "changed"
  const [phone, setPhone] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [picking, setPicking] = useState<"use" | "add" | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setSubject(step?.subject ?? ""); }, [step?.n, step?.subject]);
  if (!step) return <section className="card empty">This campaign has no emails yet.</section>;
  const sample = contacts.find((x) => x.status !== "suppressed") ?? { first_name: "Dana", firm: "Mesa Ridge CPAs", email: "dana@example.com" };
  const dirty = subject !== step.subject || body !== base;
  const save = async () => {
    const ok = await run(() => saveEmail(c.id, step.n, subject, body), "Email saved.");
    if (ok) setBase(body);
    return ok;
  };
  /** Switching email keeps what was typed, so nothing is lost by clicking around. */
  const open = async (next: number) => {
    if (dirty && !(await save())) return;
    setN(next);
  };
  const brief = async () => {
    const audience = await getAudience(c.audience);
    const persona = await getPersona(c.persona);
    await copy(`${audienceBrief(audience, persona)}Rewrite this cold email for the audience above. Keep {{FirstName}} and {{Firm}}, and keep it under 120 words.\n\nSubject: ${subject}\n\n${paragraphs(body).join("\n\n")}\n`);
  };
  const row = (e: (typeof c.emails)[number]) => (
    <li key={e.n}>
      <button type="button" className={e.n === step.n ? "on" : ""} onClick={() => void open(e.n)}>
        <b>{e.n}</b><span>{e.subject}</span><small>{e.when}</small>
      </button>
    </li>
  );
  return (
    <>
      {c.status === "draft" ? (
        <section className="check">
          <div>
            <h2>Read every email for {c.audience_name}</h2>
            <span className="k">The ready-made emails were written for CPA firms. Change anything that doesn’t fit, then tick this.</span>
          </div>
          <label className="mk-check">
            <input type="checkbox" checked={!!c.emails_read_at} onChange={(e) => void run(() => campaignAction(c.id, "emails-read", { checked: e.target.checked }), "Saved.")} />
            I read them all
          </label>
        </section>
      ) : null}
      <div className="seq">
        <section className="card">
          <ol>
            <li><div className="seqgroup">To everyone</div></li>
            {c.emails.filter((e) => e.n <= 2).map(row)}
            {c.emails.length > 2 ? <li><div className="seqgroup">Only after a yes or signup</div></li> : null}
            {c.emails.filter((e) => e.n > 2).map(row)}
          </ol>
          <div className="sequse">
            {c.pattern_open ? <button type="button" className="btn sm" onClick={() => setPicking("add")}>Add an email</button> : <span className="k">Emails can’t be added or removed once sending has started. You can still edit their text.</span>}
          </div>
        </section>
        <div className="edprev">
          <section className="card editor">
            <div className="fighead"><h2>Email {step.n}</h2><span className="k">{step.when}</span></div>
            {step.template_name ? <span className="k">Copied from {step.template_name}. Edits here stay in this campaign.</span> : null}
            <label className="fl">Subject<input className="inp" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
            <div className="fl">
              <span>Email text</span>
              <EmailBodyEditor key={`${step.n}:${step.body}`} html={step.body} label="Email text" onLoaded={(html) => { setBase(html); setBody(html); }} onChange={setBody} />
            </div>
            <span className="k">The footer and unsubscribe link are added to every email.</span>
            <div className="fr">
              <button type="button" className="btn sm dark" disabled={!dirty} onClick={() => void save()}>Save email</button>
              <button type="button" className="btn sm" disabled={dirty || !sender.mailbox_ready} title={sender.mailbox_ready ? "" : "Connect the outreach mailbox first"} onClick={() => void run(() => campaignAction(c.id, "test", { n: step.n }), "Test sent to your address.")}>Send test to me</button>
              <button type="button" className="btn sm" onClick={() => void brief()}>Copy for AI</button>
              {c.pattern_open ? <button type="button" className="btn sm" disabled={dirty} title={dirty ? "Save this email first" : ""} onClick={() => setPicking("use")}>Use a template</button> : null}
              <button type="button" className="btn sm" disabled={dirty} title={dirty ? "Save this email first" : ""} onClick={() => setSaving(true)}>Save as template</button>
              {c.pattern_open && step.n > 2 ? <button type="button" className="btn sm" onClick={() => setRemoving(true)}>Remove email</button> : null}
            </div>
          </section>
          <section className="card editor">
            <div className="fr between">
              <h2>Preview</h2>
              <div className="seg" role="group" aria-label="Preview size">
                <button type="button" className={phone ? "" : "on"} onClick={() => setPhone(false)}>Desktop</button>
                <button type="button" className={phone ? "on" : ""} onClick={() => setPhone(true)}>Phone</button>
              </div>
            </div>
            <EmailPreview sender={sender} subject={subject} body={body} sample={sample} phone={phone} />
          </section>
        </div>
      </div>
      <details className="card afmore">
        <summary>What happens after each reply</summary>
        <div className="scroll">
          <table className="tbl narrow">
            <caption className="sr">Reply rules</caption>
            <thead><tr><th scope="col">They…</th><th scope="col">Status</th><th scope="col">What happens</th></tr></thead>
            <tbody>{RULES.map((r) => <tr key={r[0]}><th scope="row"><b>{r[0]}</b></th><td><span className={"pill " + r[2]}>{r[1]}</span></td><td>{r[3]}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
      {removing ? (
        <ConfirmDialog title={`Remove Email ${step.n}?`} confirmLabel="Remove email" danger onClose={() => setRemoving(false)} onConfirm={async () => { await removeEmail(c.id, step.n); await run(async () => undefined, "Email removed."); setN(step.n - 1); }}>
          Its subject and text will be deleted. Later emails move up by one.
        </ConfirmDialog>
      ) : null}
      {picking === "use" ? (
        <TemplatePicker
          title={`Use a template for Email ${step.n}`}
          subtitle="This replaces the subject and text of this email with a copy of the template. The template itself stays as it is."
          cold={step.n <= 2}
          onClose={() => setPicking(null)}
          onPick={(id) => { setPicking(null); if (id) void run(() => useTemplate(c.id, step.n, id), "Template copied in. Edit it for this audience."); }}
        />
      ) : null}
      {picking === "add" ? (
        <TemplatePicker
          title="Add an email"
          subtitle="It goes at the end, and only reaches people who said yes or signed up."
          cold={false}
          blank
          onClose={() => setPicking(null)}
          onPick={(id) => { setPicking(null); void run(() => addEmail(c.id, id), "Email added.").then((ok) => { if (ok) setN(c.emails.length + 1); }); }}
        />
      ) : null}
      {saving ? <SaveAsTemplate c={c} n={step.n} start={step.subject} onClose={() => setSaving(false)} /> : null}
      {dialog}
    </>
  );
}
