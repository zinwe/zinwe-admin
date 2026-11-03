import { useState, type ReactElement } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { deleteWaTemplate, removeWaMedia, saveWaTemplate, uploadWaMedia, type WaKind, type WaTemplate, type WaTrack } from "../../../lib/whatsappApi";
import { Bubble, COLD_KINDS, errText, KIND_LABEL, MEDIA_ACCEPT, mediaProblem, mediaWord, MediaView, sampleText as sample, sizeText, TRACK_LABEL } from "./shared";

const KINDS = Object.keys(KIND_LABEL) as WaKind[];
const label = (t: WaTemplate) => (t.kind === "nurture" ? `After YES · ${TRACK_LABEL[t.track ?? ""]} · day ${t.day ?? 0}` : KIND_LABEL[t.kind]);

function Editor({ t, onClose, onSaved }: { t: WaTemplate; onClose: () => void; onSaved: () => void }): ReactElement {
  const toast = useToast();
  const [draft, setDraft] = useState(t);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [drop, setDrop] = useState(false); // remove the saved one on Save
  const [problem, setProblem] = useState("");
  const cold = COLD_KINDS.includes(draft.kind);
  const kept = drop ? null : t.media ?? null;
  const showing = !cold && (file || kept);
  const pick = (picked: File | undefined) => {
    if (!picked) return;
    const why = mediaProblem(picked);
    setProblem(why);
    if (!why) {
      setFile(picked);
      setDrop(false);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveWaTemplate(draft);
      if (file && !cold) await uploadWaMedia(saved.id as number, file);
      else if (t.media && (drop || cold)) await removeWaMedia(saved.id as number);
      toast("Template saved.");
      onSaved();
      onClose();
    } catch (err) {
      toast(errText(err, "Couldn't save the template."), "bad");
      setBusy(false);
    }
  };
  return (
    <Modal title={t.id ? "Edit template" : "New template"} subtitle="Use {{FirstName}}, {{Business}} and {{City}}. Keep a first message under 400 characters." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn dark" disabled={busy || !draft.name.trim() || !draft.text.trim()} onClick={() => void save()}>Save template</button></>}>
      <div className="mk mk-imp">
        <label className="fl">Name<input className="inp" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label className="fl">Type
          <select className="inp" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as WaKind })}>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        {draft.kind === "nurture" ? (
          <div className="fr">
            <label className="fl">Sequence
              <select className="inp" value={draft.track ?? ""} onChange={(e) => setDraft({ ...draft, track: e.target.value as WaTrack })}>
                {(Object.keys(TRACK_LABEL) as WaTrack[]).map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="fl">Days after the YES<input className="inp" type="number" min={0} max={90} value={draft.day ?? 0} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })} /></label>
          </div>
        ) : null}
        <label className="fl">Message <span className="k">{draft.text.length} characters</span><textarea className="inp" rows={9} maxLength={1000} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
        <div className="fl">
          <span>Picture or video <span className="k">Optional</span></span>
          {cold ? (
            <span className="k">{KIND_LABEL[draft.kind]} goes to people who haven’t replied, so it stays text only: to a stranger, a picture or video looks like spam.{t.media && !drop ? " Its saved file will be removed when you save." : ""}</span>
          ) : (
            <>
              {showing ? (
                <div className="wa-mfile">
                  <span>{file ? `${file.name} · ${sizeText(file.size)}` : `${kept?.name} · ${sizeText(kept?.size ?? 0)}`}</span>
                  <div className="fr">
                    <label className="btn sm">Replace<input className="sr" type="file" accept={MEDIA_ACCEPT} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} /></label>
                    <button type="button" className="btn sm" onClick={() => { setFile(null); setDrop(true); setProblem(""); }}>Remove</button>
                  </div>
                </div>
              ) : (
                <label className="wa-mdrop">
                  <input className="sr" type="file" accept={MEDIA_ACCEPT} aria-label="Choose a picture or video" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                  <b>Add a creative or video</b>
                  <span className="k">JPG, PNG or WebP up to 5 MB · MP4 or MOV up to 9 MB</span>
                </label>
              )}
              {problem ? <span className="aferr" role="alert">{problem}</span> : null}
              <span className="k">WhatsApp links carry text only. When you send this, Today shows the {showing ? mediaWord(file ? (file.type.startsWith("video") ? "video" : "image") : kept?.kind ?? "image") : "file"} to paste or attach in the chat.</span>
            </>
          )}
        </div>
        <span className="k">Preview</span>
        <div className="wa-chat"><Bubble text={sample(draft.text) || " "} meta="10:24" media={showing ? <MediaView media={file ? null : kept} file={file} /> : undefined} /></div>
      </div>
    </Modal>
  );
}

export function TemplatesTab({ templates, reload }: { templates: WaTemplate[]; reload: () => void }): ReactElement {
  const toast = useToast();
  const [kind, setKind] = useState<WaKind | "">("");
  const [editing, setEditing] = useState<WaTemplate | null>(null);
  const [removing, setRemoving] = useState<WaTemplate | null>(null);
  const rows = templates.filter((t) => !kind || t.kind === kind).sort((a, b) => (a.kind === "nurture" && b.kind === "nurture" ? (a.day ?? 0) - (b.day ?? 0) : 0));
  return (
    <>
      <div className="fr between">
        <div className="fr" role="group" aria-label="Type">
          <button type="button" className={"chip" + (kind === "" ? " on" : "")} onClick={() => setKind("")}>All</button>
          {KINDS.map((k) => <button key={k} type="button" className={"chip" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
        </div>
        <button type="button" className="btn dark" onClick={() => setEditing({ name: "", kind: kind || "first", text: "Hi {{FirstName}}, ", track: "", day: 0 })}>New template</button>
      </div>
      <div className="wa-tgrid">
        {rows.map((t) => (
          <article key={t.id} className="card wa-tcard">
            <header><div><h3>{t.name}</h3><span className="k">{sample(t.text).length} characters</span></div><span className={"pill" + (t.kind === "first" ? " warn" : t.kind === "nurture" ? " good" : "")}>{label(t)}</span></header>
            <div className="wa-chat"><Bubble text={sample(t.text)} meta="10:24" media={t.media ? <MediaView media={t.media} /> : undefined} /></div>
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
          <li>No links, images or PDFs until they say yes. To a stranger they look like spam. Creatives and videos go on replies and after-YES messages.</li>
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
