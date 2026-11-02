import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { deleteTemplate, getCampaigns, getTemplates, saveTemplate, type EmailTemplate, type Sender, type TemplateKind } from "../../lib/marketingApi";
import { useLoad } from "../../lib/useLoad";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, LoadingState } from "../../components/States";
import { useToast } from "../../components/Toast";
import { EmailPreview } from "./EmailPreview";
import { EmailBodyEditor, UnsavedGuard } from "./fields";
import { SAMPLE } from "./templateSample";
import "../../styles/marketing.css";

const KINDS: [TemplateKind, string][] = [
  ["Cold", "Cold: for Email 1 or 2"],
  ["Setup", "Setup: after a yes"],
  ["Tips", "Tips: after a yes"],
  ["Final", "Final: the last email"],
];
const BLANK: EmailTemplate = { name: "", kind: "Tips", subject: "", body: "<p>Hi {{FirstName}},</p><p></p><p>Vishal</p>" };
const same = (a: EmailTemplate, b: EmailTemplate) => a.name === b.name && a.kind === b.kind && a.subject === b.subject && a.body === b.body;

/** Set by the table view, where the editor sits beside the list instead of on its own page. */
export interface InlineEditor {
  onSaved: (t: EmailTemplate) => void;
  onRemoved: () => void;
  onDirty: (dirty: boolean) => void;
}

export const BLANK_TEMPLATE = BLANK;

export function TemplateEditor({ start, sender, inline }: { start: EmailTemplate; sender: Sender; inline?: InlineEditor }): ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(start);
  const [d, setD] = useState(start);
  const [source, setSource] = useState(start.body); // what the editor loads; changes only to reload it
  const [phone, setPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const leaving = useRef(false);
  const list = "/marketing/email/templates";
  const dirty = !same(d, saved);
  const ready = Boolean(d.name.trim() && d.subject.trim() && d.body.replace(/<[^>]*>/g, "").trim());
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);
  const patch = (p: Partial<EmailTemplate>) => setD((cur) => ({ ...cur, ...p }));
  const onDirty = inline?.onDirty;
  useEffect(() => { onDirty?.(dirty); }, [onDirty, dirty]);

  const save = async () => {
    setBusy(true);
    try {
      const made = await saveTemplate({ ...d, name: d.name.trim() });
      toast(d.id ? "Template saved. Campaigns that already use it keep their own copy." : "Template added.");
      if (inline) inline.onSaved(made);
      if (!d.id) {
        leaving.current = true;
        if (!inline) navigate(list);
        return;
      }
      setSaved({ ...made, body: d.body });
      setD({ ...made, body: d.body });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "bad");
    }
    setBusy(false);
  };

  return (
    <>
      {inline ? null : (
        <>
          <PageHeader
            title={d.id ? saved.name : "New template"}
            badge={d.built_in ? <span className="pill" style={{ marginLeft: 10, verticalAlign: "middle" }}>Starter</span> : null}
            subtitle={d.built_in ? "New campaigns start from this text. It can be edited, but not removed, because the email patterns use it." : "Write it once, then pick it for any campaign and adjust it there."}
          />
          <Link className="lnk afback" to={list}>Back to templates</Link>
        </>
      )}
      <div className="edprev">
        <section className="card editor">
          {inline ? <div className="fighead"><h2>{d.id ? saved.name : "New template"}</h2>{d.built_in ? <span className="k">Starter template</span> : null}</div> : null}
          <div className="two">
            <label className="fl">Template name<input className="inp" maxLength={120} value={d.name} placeholder="Example: Clinics first cold email" onChange={(e) => patch({ name: e.target.value })} /></label>
            <label className="fl">When it’s used
              <select className="inp" value={d.kind} disabled={d.built_in} onChange={(e) => patch({ kind: e.target.value as TemplateKind })}>
                {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
          </div>
          <label className="fl">Subject<input className="inp" maxLength={200} value={d.subject} placeholder="What they see in their inbox" onChange={(e) => patch({ subject: e.target.value })} /></label>
          <div className="fl">
            <span>Email text</span>
            <EmailBodyEditor key={source} html={source} label="Email text" onLoaded={(html) => { setSaved((cur) => ({ ...cur, body: html })); setD((cur) => ({ ...cur, body: html })); }} onChange={(html) => patch({ body: html })} />
          </div>
          <span className="k">Keep it simple: plain emails feel personal. The footer and unsubscribe link are added to every email.</span>
        </section>
        <section className="card editor">
          <div className="fr between">
            <h2>How it looks</h2>
            <div className="seg" role="group" aria-label="Preview size">
              <button type="button" className={phone ? "" : "on"} onClick={() => setPhone(false)}>Desktop</button>
              <button type="button" className={phone ? "on" : ""} onClick={() => setPhone(true)}>Phone</button>
            </div>
          </div>
          <EmailPreview sender={sender} subject={d.subject} body={d.body} sample={SAMPLE} phone={phone} />
        </section>
      </div>
      <div className="card savebar">
        <span className="k">{dirty ? "You have unsaved changes." : d.id ? "All changes saved." : "Name it, then add a subject and text."}</span>
        <div>
          {d.id && !d.built_in ? <button type="button" className="btn" disabled={busy} onClick={() => setRemoving(true)}>Remove template</button> : null}
          {dirty && d.id ? <button type="button" className="btn" disabled={busy} onClick={() => { setD(saved); setSource(`${saved.body} `); }}>Discard</button> : null}
          <button type="button" className="btn dark" disabled={busy || !ready || !dirty} onClick={() => void save()}>Save template</button>
        </div>
      </div>
      <UnsavedGuard blocker={blocker} dirty={dirty} />
      {removing ? (
        <ConfirmDialog
          title="Remove this template?"
          confirmLabel="Remove template"
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await deleteTemplate(d.id as number);
            leaving.current = true;
            toast("Template removed. Campaigns keep their copies.");
            if (inline) inline.onRemoved();
            else navigate(list);
          }}
        >
          Campaigns that used it keep their own copy.
        </ConfirmDialog>
      ) : null}
    </>
  );
}

export function TemplateEditorPage(): ReactElement {
  const tid = useParams().tid;
  const load = useCallback(() => Promise.all([getTemplates(), getCampaigns()]), []);
  const { data, error, reload } = useLoad(load);
  const found = data?.[0].find((t) => String(t.id) === tid);
  return (
    <div className="mk">
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <LoadingState /> : tid && !found ? (
        <section className="card empty"><b>This template is gone</b><Link className="btn" to="/marketing/email/templates">Back to templates</Link></section>
      ) : <TemplateEditor key={tid ?? "new"} start={found ?? BLANK} sender={data[1].sender} />}
    </div>
  );
}
