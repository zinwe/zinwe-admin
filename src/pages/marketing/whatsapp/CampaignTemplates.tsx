/**
 * The 90-day campaign's templates (100 Reviews, owner 10 Nov 2026): one row per message with Category · Type · Track ·
 * English | Hinglish · Creative · Offer & coupon · Stage & day · Performance. A row is a draft until both texts are
 * written; drafts are never sent. Only Engage and Demo video carry a Track.
 */
import { useEffect, useState, type ReactElement } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { ApiError } from "../../../lib/api";
import { getCoupons, type Coupon } from "../../../lib/couponsApi";
import { deleteWaTemplate, removeWaMedia, saveWaTemplate, uploadWaMedia, type WaCategory, type WaLanguage, type WaTemplate, type WaTrack } from "../../../lib/whatsappApi";
import {
  Bubble, CATEGORIES, CATEGORY_HELP, CATEGORY_LABEL, CATEGORY_TYPES, errText, mediaWord, MediaView, sampleText as sample, TRACK_LABEL, TRACKED, TRACKS, trackName,
} from "./shared";
import { MediaPicker } from "./TemplatesTab";

type Cat = Exclude<WaCategory, "">;
const STEPS: Partial<Record<Cat, number>> = { engage: 6, demo_video: 6, setup: 2, testimonial: 2 };
const NEXT_LABEL: Partial<Record<Cat, string>> = { outreach: "YES", offer: "Paid", engage: "Track set", testimonial: "Got one" };
const STOP_LINE = /Reply STOP to opt out\.?\s*$/;
const pct = (n: number, d: number): number => (d ? Math.round((n / d) * 100) : 0);
const cut = (text: string): string => (text.length > 150 ? `${text.slice(0, 148).replace(/\s+\S*$/, "")}…` : text);
const stageOfDay = (day: number): number => Math.min(3, Math.floor((Math.max(1, day) - 1) / 30) + 1);
const short = (ymd: string | null | undefined): string =>
  ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "no end";

/** [stage line, day line] for the Stage & day column. */
function whenLabel(t: WaTemplate): [string, string] {
  switch (t.category as Cat) {
    case "outreach": return [`Stage ${t.stage || stageOfDay(t.step ?? 1)}`, `day ${t.step}`];
    case "offer": return [`Stage ${t.stage}${t.event ? " · event" : ""}`, t.coupon_info ? `${short(t.coupon_info.starts_on)} – ${short(t.coupon_info.ends_on)}` : "no code yet"];
    case "engage": return ["After YES", `step ${t.step}`];
    case "demo_video": return ["After Track", `${t.step} of 6`];
    case "setup": return ["After demo", `step ${t.step}`];
    case "demo_call": return ["On a setup error", "existing firms only"];
    case "testimonial": return ["After use", t.step === 2 ? "after the written one" : "14 days after 1st PC"];
    default: return ["Any time", "on their message"];
  }
}

function Editor({ t, coupons, onClose, onSaved }: { t: WaTemplate; coupons: Coupon[]; onClose: () => void; onSaved: () => void }): ReactElement {
  const toast = useToast();
  const [d, setD] = useState<WaTemplate>(t);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [drop, setDrop] = useState(false);
  const [lang, setLang] = useState<WaLanguage>("en");
  const cat = (d.category || "outreach") as Cat;
  const tracked = TRACKED.includes(cat);
  const cold = cat === "outreach";
  const kept = drop ? null : t.media ?? null;
  const types = [...new Set([...(d.type_name ? [d.type_name] : []), ...CATEGORY_TYPES[cat]])];
  const usable = coupons.filter((c) => c.status === "live" || c.status === "scheduled" || c.id === t.coupon);
  const set = (patch: Partial<WaTemplate>) => {
    setD((x) => ({ ...x, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      return next;
    });
  };
  const pickCategory = (c: Cat) => set({
    category: c, type_name: CATEGORY_TYPES[c][0], track: TRACKED.includes(c) ? d.track || "privacy" : "",
    step: c === "outreach" ? d.step || 1 : STEPS[c] ? 1 : 0, stage: c === "offer" ? d.stage || 1 : 0,
  });
  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveWaTemplate({ ...d, category: cat, text: d.text ?? "", text_hi: d.text_hi ?? "" });
      if (file && !cold) await uploadWaMedia(saved.id as number, file);
      else if (t.media && (drop || cold)) await removeWaMedia(saved.id as number);
      toast(saved.draft ? "Saved as a draft: it can't be sent until both texts are written." : "Template saved.");
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      toast(errText(err, "Couldn't save the template."), "bad");
      setBusy(false);
    }
  };
  const stopNote = (text: string): string => {
    if (!text.trim()) return "To write";
    if (cat === "quick_reply") return "A quick reply needs no STOP line";
    return STOP_LINE.test(text) ? "Ends with “Reply STOP to opt out.”" : "Add “Reply STOP to opt out.” at the end";
  };
  const shown = lang === "hi" ? d.text_hi ?? "" : d.text ?? "";
  const media = !cold && (file || kept) ? <MediaView media={file ? null : kept} file={file} /> : undefined;
  const err = (k: string) => (errors[k] ? <span className="aferr" role="alert">{errors[k]}</span> : null);
  return (
    <Modal title={t.id ? "Edit campaign template" : "New campaign template"} subtitle="Placeholders: {{FirstName}}, {{Business}}, {{City}}. Both texts are needed before it can be sent." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn dark" disabled={busy} onClick={() => void save()}>Save template</button></>}>
      <div className="mk mk-imp">
        <div className="fl"><span>Category</span>
          <div className="fr" role="group" aria-label="Category">
            {CATEGORIES.map((c) => <button key={c} type="button" className={"chip" + (cat === c ? " on" : "")} aria-pressed={cat === c} onClick={() => pickCategory(c)}>{CATEGORY_LABEL[c]}</button>)}
          </div>
          <span className="k">{CATEGORY_HELP[cat]}</span>
        </div>
        <div className="wa-tform">
          <label className="fl">Type
            <select className="inp" value={d.type_name ?? ""} onChange={(e) => set({ type_name: e.target.value })}>
              {types.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          {tracked ? (
            <label className="fl">Track <span className="k">Only contacts with this Track get it</span>
              <select className="inp" value={d.track ?? ""} onChange={(e) => set({ track: e.target.value as WaTrack })}>
                {TRACKS.map((x) => <option key={x} value={x}>{TRACK_LABEL[x]}</option>)}
              </select>
              {err("track")}
            </label>
          ) : <div className="fl"><span>Track</span><span className="k">Not used: {CATEGORY_LABEL[cat]} goes to every contact, whatever their Track.</span></div>}
        </div>
        <div className="wa-tform">
          {cat === "outreach" ? (
            <label className="fl">Day (1–90) <span className="k">Stage {stageOfDay(d.step || 1)} · one message a day at most</span>
              <input className="inp" type="number" min={1} max={90} value={d.step ?? 1} onChange={(e) => set({ step: Number(e.target.value) })} />
              {err("step")}
            </label>
          ) : null}
          {cat === "offer" ? (
            <label className="fl">Stage
              <select className="inp" value={d.stage ?? 1} onChange={(e) => set({ stage: Number(e.target.value) })}>
                {[1, 2, 3].map((x) => <option key={x} value={x}>Stage {x}</option>)}
              </select>
              {err("stage")}
            </label>
          ) : null}
          {STEPS[cat] ? (
            <label className="fl">Step <span className="k">1–{STEPS[cat]}, sent in this order</span>
              <input className="inp" type="number" min={1} max={STEPS[cat]} value={d.step ?? 1} onChange={(e) => set({ step: Number(e.target.value) })} />
              {err("step")}
            </label>
          ) : null}
        </div>
        {cat === "offer" ? (
          <div className="wa-tform">
            <label className="fl">Coupon code <span className="k">Live or yet to start; ended codes are hidden</span>
              <select className="inp" value={d.coupon ?? 0} onChange={(e) => set({ coupon: Number(e.target.value) || null })}>
                <option value={0}>No code</option>
                {usable.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.percent_off}% · {short(c.starts_on)} to {short(c.ends_on)} · {c.status}</option>)}
              </select>
              {err("coupon")}
            </label>
            <label className="fl"><span><input type="checkbox" checked={!!d.event} onChange={(e) => set({ event: e.target.checked })} /> Festival code</span><span className="k">Staff pick it by hand; the queue never does (40% is a ceiling, never a default).</span></label>
          </div>
        ) : null}
        <div className="wa-tform">
          <label className="fl">Message (English) <span className="k">{(d.text ?? "").length} characters · {stopNote(d.text ?? "")}</span>
            <textarea className="inp" rows={7} maxLength={1000} value={d.text ?? ""} onChange={(e) => set({ text: e.target.value })} />
            {err("text")}
          </label>
          <label className="fl">Message (Hinglish) <span className="k">{(d.text_hi ?? "").length} characters · {stopNote(d.text_hi ?? "")}</span>
            <textarea className="inp" rows={7} maxLength={1000} value={d.text_hi ?? ""} onChange={(e) => set({ text_hi: e.target.value })} />
            {err("text_hi")}
          </label>
        </div>
        <div className="fl"><span>Creative <span className="k">Optional</span></span>
          <MediaPicker t={{ ...d, kind: cold ? "first" : "nurture" }} cold={cold} file={file} setFile={setFile} drop={drop} setDrop={setDrop} />
        </div>
        <label className="fl">Name <span className="k">Optional: made from the category, type and day when left empty</span>
          <input className="inp" value={d.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="fr between"><span className="k">Preview · Mehta &amp; Co CA</span>
          <div className="seg" role="tablist" aria-label="Preview language">
            <button type="button" role="tab" aria-selected={lang === "en"} className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>English</button>
            <button type="button" role="tab" aria-selected={lang === "hi"} className={lang === "hi" ? "on" : ""} onClick={() => setLang("hi")}>Hinglish</button>
          </div>
        </div>
        <div className="wa-chat"><Bubble text={sample(shown, "Mehta & Co CA", "Rohit", lang) || "To write"} meta="10:42" media={media} /></div>
      </div>
    </Modal>
  );
}

type TrackFilter = WaTrack | "all" | "none";
const TRACK_FILTERS: [TrackFilter, string][] = [["all", "Every Track"], ...TRACKS.map((x): [TrackFilter, string] => [x, TRACK_LABEL[x]]), ["none", "No Track"]];

export function CampaignTemplates({ templates, reload, toggle }: { templates: WaTemplate[]; reload: () => void; toggle: ReactElement }): ReactElement {
  const toast = useToast();
  const [cat, setCat] = useState<Cat | "">("");
  const [track, setTrack] = useState<TrackFilter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<WaTemplate | null>(null);
  const [removing, setRemoving] = useState<WaTemplate | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  useEffect(() => { getCoupons().then((o) => setCoupons(o.coupons)).catch(() => setCoupons([])); }, []);
  const live = templates.filter((t) => !t.archived);
  const needle = q.trim().toLowerCase();
  const order = (t: WaTemplate) =>
    CATEGORIES.indexOf(t.category as Cat) * 100000 + (t.track ? TRACKS.indexOf(t.track as Exclude<WaTrack, "">) * 1000 : 0) + (t.stage ?? 0) * 100 + (t.step ?? 0);
  const rows = live
    .filter((t) => (!cat || t.category === cat) && (track === "all" || (track === "none" ? !t.track : t.track === track)))
    .filter((t) => !needle || `${t.name} ${t.text} ${t.text_hi ?? ""} ${t.coupon_info?.code ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => order(a) - order(b));
  const drafts = live.filter((t) => t.draft).length;
  const rate = (t: WaTemplate) => pct(t.performance?.replies ?? 0, t.performance?.sends ?? 0);
  const best = live.filter((t) => (t.performance?.sends ?? 0) >= 5 && t.category !== "quick_reply").sort((a, b) => rate(b) - rate(a))[0];
  const tiles: [string, string, string][] = [
    [String(live.length), "Templates", CATEGORIES.map((c) => `${CATEGORY_LABEL[c]} ${live.filter((t) => t.category === c).length}`).join(" · ")],
    [String(drafts), "To write", drafts ? "Drafts are never sent: write both texts" : "Every template has both texts"],
    [best ? `${rate(best)}%` : "—", "Best reply rate", best ? `${best.name} · ${best.performance?.sends} sends` : "Shown after 5 sends of one template"],
    [String(live.filter((t) => t.category === "offer" && t.coupon_info?.status === "live").length), "Offer codes live today", "One Offer & discount row per code"],
  ];
  const fresh = (): WaTemplate => {
    const c: Cat = cat || "outreach";
    return { name: "", kind: c === "outreach" ? "first" : "nurture", category: c, type_name: CATEGORY_TYPES[c][0], track: TRACKED.includes(c) ? "privacy" : "", step: c === "outreach" || STEPS[c] ? 1 : 0, stage: c === "offer" ? 1 : 0, text: "", text_hi: "" };
  };
  return (
    <>
      <div className="fr between">{toggle}<button type="button" className="btn dark" onClick={() => setEditing(fresh())}>New template</button></div>
      <div className="tiles">
        {tiles.map(([v, l, n]) => <div key={l} className="card tile"><b className="num">{v}</b><span className="k">{l}</span><span className="k wa-tnote">{n}</span></div>)}
      </div>
      <section className="card finder" aria-label="Find templates">
        <div className="fr" role="group" aria-label="Category">
          <button type="button" className={"chip" + (cat === "" ? " on" : "")} aria-pressed={cat === ""} onClick={() => setCat("")}>All <span className="k">{live.length}</span></button>
          {CATEGORIES.map((c) => <button key={c} type="button" className={"chip" + (cat === c ? " on" : "")} aria-pressed={cat === c} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]} <span className="k">{live.filter((t) => t.category === c).length}</span></button>)}
        </div>
        <div className="fr">
          <div className="fr" role="group" aria-label="Track">
            {TRACK_FILTERS.map(([k, l]) => <button key={k} type="button" className={"chip" + (track === k ? " on" : "")} aria-pressed={track === k} onClick={() => setTrack(k)}>{l}</button>)}
          </div>
          <div className="search"><input type="search" className="inp" aria-label="Search templates" placeholder="Search a message or code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
      </section>
      <section className="card tablebox" aria-label="Campaign templates">
        <div className="scroll">
          <table className="tbl wa-ttable">
            <caption className="sr">Campaign templates</caption>
            <thead><tr>
              <th scope="col">Category</th><th scope="col">Type</th><th scope="col">Track</th><th scope="col">Message (English)</th><th scope="col">Message (Hinglish)</th>
              <th scope="col">Creative</th><th scope="col">Offer &amp; coupon</th><th scope="col">Stage &amp; day</th><th scope="col">Performance</th><th scope="col"><span className="sr">Actions</span></th>
            </tr></thead>
            <tbody>
              {rows.map((t) => {
                const [stage, day] = whenLabel(t);
                const p = t.performance ?? { sends: 0, replies: 0, next: 0 };
                let perf: ReactElement | string = "Not sent yet";
                if (t.draft) perf = "Draft · can’t be sent";
                else if (t.category === "quick_reply") perf = `Sent ${p.sends} times · not scored`;
                else if (p.sends) perf = <>Replies {pct(p.replies, p.sends)}%<br />{NEXT_LABEL[t.category as Cat] ?? "Next step"} {pct(p.next, p.sends)}% · {p.sends} sends</>;
                return (
                  <tr key={t.id}>
                    <th scope="row">{CATEGORY_LABEL[t.category as Cat]}</th>
                    <td>{t.type_name}</td>
                    <td>{TRACKED.includes(t.category ?? "") ? <span className="pill">{trackName(t.track)}</span> : <span className="k">—</span>}</td>
                    <td className="wa-tmsg" title={t.text || undefined}>{t.text ? cut(sample(t.text, "Mehta & Co CA", "Rohit")) : <span className="pill wa-todo">To write</span>}</td>
                    <td className="wa-tmsg" title={t.text_hi || undefined}>{t.text_hi ? cut(sample(t.text_hi, "Mehta & Co CA", "Rohit", "hi")) : <span className="pill wa-todo">To write</span>}</td>
                    <td>{t.media ? <span className="pill">{mediaWord(t.media.kind)}</span> : <span className="k">none</span>}</td>
                    <td>{t.coupon_info ? <><span className="k" style={{ display: "block" }}>{t.coupon_info.percent_off}% · {t.coupon_info.status}</span><b className="num wa-code">{t.coupon_info.code}</b></> : <span className="k">—</span>}</td>
                    <td><b>{stage}</b><span className="k" style={{ display: "block" }}>{day}</span></td>
                    <td className="k">{perf}</td>
                    <td className="wa-tacts">
                      <button type="button" className="btn sm" onClick={() => setEditing(t)}>{t.draft ? "Write" : "Edit"}</button>
                      <button type="button" className="btn sm danger" onClick={() => setRemoving(t)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length ? null : <div className="empty">{live.length ? "No templates match." : "No campaign templates yet."}</div>}
      </section>
      <span className="k">Replies = sends they answered within 3 days. The second number is the step each category is for. Only Engage and Demo video have a Track: the contact’s Track picks which of those rows they get.</span>
      {editing ? <Editor t={editing} coupons={coupons} onClose={() => setEditing(null)} onSaved={reload} /> : null}
      {removing ? (
        <ConfirmDialog title={`Delete "${removing.name}"?`} confirmLabel="Delete" danger onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try { await deleteWaTemplate(removing.id as number); reload(); } catch (e) { toast(errText(e, "Couldn't delete it."), "bad"); }
          }}>
          Messages already sent keep their text; contacts move on to the next template in the path.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
