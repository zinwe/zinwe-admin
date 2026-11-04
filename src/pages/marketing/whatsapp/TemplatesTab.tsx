import { useState, type ReactElement } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { ApiError } from "../../../lib/api";
import { deleteWaTemplate, removeWaMedia, saveWaTemplate, uploadWaMedia, type WaKind, type WaParts, type WaTemplate, type WaTrack } from "../../../lib/whatsappApi";
import {
  Bubble, COLD_KINDS, composeParts, errText, isStructured, KIND_LABEL, MEDIA_ACCEPT, mediaProblem, mediaWord, MediaView, PARTS,
  sampleText as sample, sizeText, TRACK_LABEL,
} from "./shared";

const KINDS = Object.keys(KIND_LABEL) as WaKind[];
const label = (t: WaTemplate) => (t.kind === "nurture" ? `After YES · ${TRACK_LABEL[t.track ?? ""]} · day ${t.day ?? 0}` : KIND_LABEL[t.kind]);
const INTRO = "Vishal from Zinwe here. {{HowWeKnow}}";

/** Best guess at the parts of a free-text template (greeting line, then one paragraph each), for staff to check. */
function splitText(text: string): WaParts {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const intro = (blocks[0] ?? "").replace(/^\s*(\{\{Greeting\}\}|(Hi|Hello)\s+\{\{FirstName\}\}),?\s*/, "");
  const [problem = "", solution = "", reward = "", cta = "", ...rest] = blocks.slice(1);
  return { intro: intro || INTRO, problem, solution, reward, cta, details: rest.join("\n") };
}

/** The media picker, shared by both editors: cold messages stay text only. */
function MediaPicker({ t, cold, file, setFile, drop, setDrop }: {
  t: WaTemplate; cold: boolean; file: File | null; setFile: (f: File | null) => void; drop: boolean; setDrop: (d: boolean) => void;
}): ReactElement {
  const [problem, setProblem] = useState("");
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
  if (cold) {
    return <span className="k">{KIND_LABEL[t.kind]} goes to people who haven’t replied, so it stays text only: to a stranger, a picture or video looks like spam. Put the creative idea above and use it on the reply.{t.media && !drop ? " Its saved file will be removed when you save." : ""}</span>;
  }
  return (
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
          <b>Add the creative: a picture or video</b>
          <span className="k">JPG, PNG or WebP up to 5 MB · MP4 or MOV up to 9 MB</span>
        </label>
      )}
      {problem ? <span className="aferr" role="alert">{problem}</span> : null}
      {showing ? <span className="k">WhatsApp links carry text only. When you send this, Today shows the {mediaWord(file ? (file.type.startsWith("video") ? "video" : "image") : kept?.kind ?? "image")} to paste or attach in the chat.</span> : null}
    </>
  );
}

function Editor({ t, onClose, onSaved }: { t: WaTemplate; onClose: () => void; onSaved: () => void }): ReactElement {
  const toast = useToast();
  const [draft, setDraft] = useState(t);
  const [structured, setStructured] = useState(isStructured(t.parts) || !t.id);
  const [parts, setParts] = useState<WaParts>(isStructured(t.parts) ? t.parts ?? {} : !t.id ? { intro: INTRO } : splitText(t.text));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [drop, setDrop] = useState(false);
  const cold = COLD_KINDS.includes(draft.kind);
  const kept = drop ? null : t.media ?? null;
  const showing = !cold && (file || kept);
  const text = structured ? composeParts(parts) : draft.text;
  const missing = structured ? PARTS.filter((p) => p.required && !(parts[p.key] ?? "").trim()).map((p) => p.label) : [];
  const setPart = (key: keyof WaParts, value: string) => {
    setParts((p) => ({ ...p, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };
  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveWaTemplate({ ...draft, text, parts: structured ? parts : {} });
      if (file && !cold) await uploadWaMedia(saved.id as number, file);
      else if (t.media && (drop || cold)) await removeWaMedia(saved.id as number);
      toast("Template saved.");
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      toast(errText(err, "Couldn't save the template."), "bad");
      setBusy(false);
    }
  };
  const media = showing ? <MediaView media={file ? null : kept} file={file} /> : undefined;
  return (
    <Modal title={t.id ? "Edit template" : "New template"} subtitle="Placeholders: {{Business}}, {{City}}, {{HowWeKnow}} (“I found you on Google Maps, where you're rated 4.8.”) and {{FirstName}}. Keep a first message under 400 characters." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn dark" disabled={busy || !draft.name.trim() || !text.trim() || missing.length > 0} title={missing.length ? `Add: ${missing.join(", ")}` : undefined} onClick={() => void save()}>Save template</button></>}>
      <div className="mk mk-imp">
        <div className="wa-tform">
          <label className="fl">Name<input className="inp" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="fl">Type
            <select className="inp" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as WaKind })}>
              {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
        </div>
        {draft.kind === "nurture" ? (
          <div className="fr">
            <label className="fl">Sequence
              <select className="inp" value={draft.track ?? ""} onChange={(e) => setDraft({ ...draft, track: e.target.value as WaTrack })}>
                {(Object.keys(TRACK_LABEL) as WaTrack[]).map((tr) => <option key={tr} value={tr}>{TRACK_LABEL[tr]}</option>)}
              </select>
            </label>
            <label className="fl">Days after the YES<input className="inp" type="number" min={0} max={90} value={draft.day ?? 0} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })} /></label>
          </div>
        ) : null}
        <div className="seg" role="tablist" aria-label="How this template is written">
          <button type="button" role="tab" aria-selected={structured} className={structured ? "on" : ""} onClick={() => { if (!structured) setParts(splitText(draft.text)); setStructured(true); }}>Outreach structure</button>
          <button type="button" role="tab" aria-selected={!structured} className={!structured ? "on" : ""} onClick={() => { if (structured) setDraft({ ...draft, text }); setStructured(false); }}>Free text</button>
        </div>

        {structured ? (
          <ol className="wa-parts">
            {PARTS.map((p) => (
              <li key={p.key} className={"wa-part" + (p.sent ? "" : " is-quiet") + (errors[p.key] ? " has-err" : "")}>
                <div className="wa-part__head">
                  <b>{p.label}</b>
                  <span className="k">{p.required ? "Required" : "Optional"}{p.sent ? "" : " · not sent"}{(parts[p.key] ?? "").length ? ` · ${(parts[p.key] ?? "").length} characters` : ""}</span>
                </div>
                <span className="k">{p.hint}</span>
                <textarea className="inp" rows={p.rows} placeholder={p.example} value={parts[p.key] ?? ""} aria-label={p.label} onChange={(e) => setPart(p.key, e.target.value)} />
                {errors[p.key] ? <span className="aferr" role="alert">{errors[p.key]}</span> : null}
                {p.key === "creative" ? <MediaPicker t={draft} cold={cold} file={file} setFile={setFile} drop={drop} setDrop={setDrop} /> : null}
              </li>
            ))}
          </ol>
        ) : (
          <>
            <label className="fl">Message <span className="k">{draft.text.length} characters</span><textarea className="inp" rows={9} maxLength={1000} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
            <div className="fl"><span>Picture or video <span className="k">Optional</span></span><MediaPicker t={draft} cold={cold} file={file} setFile={setFile} drop={drop} setDrop={setDrop} /></div>
          </>
        )}

        <span className="k">Preview · {sample(text).length} characters</span>
        <div className="wa-previews">
          <div><span className="k">We know their name</span><div className="wa-chat"><Bubble text={sample(text) || " "} meta="10:24" media={media} /></div></div>
          <div><span className="k">We don’t know a real name</span><div className="wa-chat"><Bubble text={sample(text, "Gupta Exim", "") || " "} meta="10:24" media={media} /></div></div>
        </div>
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
        <button type="button" className="btn dark" onClick={() => setEditing({ name: "", kind: kind || "first", text: "", parts: { intro: INTRO }, track: "", day: 0 })}>New template</button>
      </div>
      <div className="wa-tgrid">
        {rows.map((t) => (
          <article key={t.id} className="card wa-tcard">
            <header>
              <div><h3>{t.name}</h3><span className="k">{sample(t.text).length} characters{isStructured(t.parts) ? " · outreach structure" : ""}</span></div>
              <span className={"pill" + (t.kind === "first" ? " warn" : t.kind === "nurture" ? " good" : "")}>{label(t)}</span>
            </header>
            <div className="wa-chat"><Bubble text={sample(t.text)} meta="10:24" media={t.media ? <MediaView media={t.media} /> : undefined} /></div>
            {t.parts?.creative && !t.media ? <p className="k wa-hint"><b>Creative:</b> {t.parts.creative}</p> : null}
            <footer className="fr between">
              <button type="button" className="btn sm" onClick={() => setEditing(t)}>Edit</button>
              <button type="button" className="btn sm danger" onClick={() => setRemoving(t)}>Delete</button>
            </footer>
          </article>
        ))}
      </div>
      <section className="card editor">
        <h2>The WhatsApp outreach structure</h2>
        <span className="k">Every structured template has the same parts in the same order; only the words change.</span>
        <ol className="wa-rules">
          <li><b>Creative:</b> a picture or video, or the idea for one. Text only until they reply.</li>
          <li><b>Intro:</b> “Hi Rohit,” or “Hello Webgross team,” when we don’t know a real name, then who you are and how you know them.</li>
          <li><b>Value:</b> one problem they’ll recognise, then the one Zinwe answer to it.</li>
          <li><b>Reward:</b> the cherry-on-top line.</li>
          <li><b>Call to action:</b> one easy ask, and how to stop.</li>
          <li><b>Other details:</b> optional. No links in a first message.</li>
          <li><b>Notes for replies:</b> never sent; context for the next reply, like Claude in the browser.</li>
        </ol>
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
