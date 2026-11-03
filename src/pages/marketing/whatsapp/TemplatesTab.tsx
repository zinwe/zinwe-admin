import { useState, type ReactElement } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { deleteWaTemplate, saveWaTemplate, type WaKind, type WaTemplate } from "../../../lib/whatsappApi";
import { Bubble, errText, KIND_LABEL } from "./shared";

const KINDS = Object.keys(KIND_LABEL) as WaKind[];
const sample = (t: string) => t.replace(/\{\{FirstName\}\}/g, "Rakesh").replace(/\{\{Firm\}\}/g, "Gupta Exim");

function Editor({ t, onClose, onSaved }: { t: WaTemplate; onClose: () => void; onSaved: () => void }): ReactElement {
  const toast = useToast();
  const [draft, setDraft] = useState(t);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await saveWaTemplate(draft);
      toast("Template saved.");
      onSaved();
      onClose();
    } catch (err) {
      toast(errText(err, "Couldn't save the template."), "bad");
      setBusy(false);
    }
  };
  return (
    <Modal title={t.id ? "Edit template" : "New template"} subtitle="Use {{FirstName}} and {{Firm}}. Keep a first message under 400 characters." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn dark" disabled={busy || !draft.name.trim() || !draft.text.trim()} onClick={() => void save()}>Save template</button></>}>
      <div className="mk mk-imp">
        <label className="fl">Name<input className="inp" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="fl">Type
          <select className="inp" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as WaKind })}>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="fl">Message <span className="k">{draft.text.length} characters</span><textarea className="inp" rows={9} maxLength={1000} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
        <span className="k">Preview</span>
        <div className="wa-chat"><Bubble text={sample(draft.text) || " "} meta="10:24" /></div>
      </div>
    </Modal>
  );
}

export function TemplatesTab({ templates, reload }: { templates: WaTemplate[]; reload: () => void }): ReactElement {
  const toast = useToast();
  const [kind, setKind] = useState<WaKind | "">("");
  const [editing, setEditing] = useState<WaTemplate | null>(null);
  const [removing, setRemoving] = useState<WaTemplate | null>(null);
  const rows = templates.filter((t) => !kind || t.kind === kind);
  return (
    <>
      <div className="fr between">
        <div className="fr" role="group" aria-label="Type">
          <button type="button" className={"chip" + (kind === "" ? " on" : "")} onClick={() => setKind("")}>All</button>
          {KINDS.map((k) => <button key={k} type="button" className={"chip" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
        </div>
        <button type="button" className="btn dark" onClick={() => setEditing({ name: "", kind: kind || "first", text: "Hi {{FirstName}}, " })}>New template</button>
      </div>
      <div className="wa-tgrid">
        {rows.map((t) => (
          <article key={t.id} className="card wa-tcard">
            <header><div><h3>{t.name}</h3><span className="k">{sample(t.text).length} characters</span></div><span className={"pill" + (t.kind === "first" ? " warn" : "")}>{KIND_LABEL[t.kind]}</span></header>
            <div className="wa-chat"><Bubble text={sample(t.text)} meta="10:24" /></div>
            <footer className="fr between">
              <button type="button" className="btn sm" onClick={() => setEditing(t)}>Edit</button>
              <button type="button" className="btn sm danger" onClick={() => setRemoving(t)}>Delete</button>
            </footer>
          </article>
        ))}
      </div>
      <section className="card editor">
        <h2>What makes a good first message</h2>
        <ul className="wa-rules">
          <li>Say who you are in the first line.</li>
          <li>One problem, one offer, under 400 characters.</li>
          <li>Tell them how to stop: reply STOP.</li>
          <li>No links, images or PDFs until they say yes. To a stranger they look like spam.</li>
        </ul>
      </section>
      {editing ? <Editor t={editing} onClose={() => setEditing(null)} onSaved={reload} /> : null}
      {removing ? (
        <ConfirmDialog title={`Delete "${removing.name}"?`} confirmLabel="Delete" danger onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try { await deleteWaTemplate(removing.id as number); reload(); } catch (err) { toast(errText(err, "Couldn't delete it."), "bad"); }
          }}>
          Campaigns that use it as a reply or follow-up fall back to another template of the same type.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
