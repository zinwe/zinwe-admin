/**
 * The Templates page's editor (board AdminWaTemplates, "Edit"): it replaces the cards, Back returns to them.
 * The message is written as blocks (Text, and "If a detail is known -> Then show / Otherwise"), in English and
 * Hinglish; on the right a live phone preview for the Preview as contact, and the checks.
 * "Try a new version" opens it on version B: only the words change, and saving starts the A/B test.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { useToast } from "../../../components/Toast";
import { ApiError } from "../../../lib/api";
import { getCoupons, type Coupon } from "../../../lib/couponsApi";
import {
  addWaTag, addWaVersion, patchWaTemplate, removeWaMedia, saveWaTemplate, uploadWaMedia, type WaKind, type WaTag, type WaTemplate, type WaTrack,
} from "../../../lib/whatsappApi";
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_TYPES, errText, MediaPicker, TRACK_LABEL, TRACKED, TRACKS } from "./shared";
import {
  DETAIL_LABEL, DETAILS, fillText, isCond, looseDetails, newCond, parseBlocks, plainOf, segments, serializeBlocks, type Block, type CondBlock,
} from "./templateBlocks";
import { band, numbersOf, STEPS, type Cat, type PreviewContact, type QuickPicks } from "./templateModel";
import { MediaCard, WhoPicker, type CardLang } from "./templateParts";

/** What the editor opens on: a template (or null for a new one in `cat`), or a template's version B. */
export interface EditTarget {
  t: WaTemplate | null;
  cat: Cat;
  versionB?: boolean;
}

type L = "en" | "hi";
const LANG_NAME: Record<L, string> = { en: "English", hi: "Hinglish" };
const READ_ONLY = ["tags", "stats", "version_b", "performance", "coupon_info", "media", "draft", "updated_at",
  "sends", "replies", "reply_rate", "next", "next_rate", "sends_en", "replies_en", "reply_rate_en", "sends_hi", "replies_hi", "reply_rate_hi"];

/** The body to PUT/POST for a template: what the server computes left out, its tags as `tag_ids`. */
export function saveBody(t: WaTemplate): WaTemplate {
  const body: Record<string, unknown> = { ...t };
  READ_ONLY.forEach((k) => delete body[k]);
  if (t.tags) body.tag_ids = t.tags.map((g) => g.id);
  return body as unknown as WaTemplate;
}

const kindFor = (c: Cat): WaKind => (c === "outreach" ? "first" : c === "quick_reply" ? "question" : "nurture");

function blank(cat: Cat): WaTemplate {
  return {
    name: "", kind: kindFor(cat), category: cat, type_name: CATEGORY_TYPES[cat][0], track: TRACKED.includes(cat) ? "privacy" : "",
    step: cat === "outreach" || STEPS[cat] ? 1 : 0, stage: cat === "offer" ? 1 : 0, text: "", text_hi: "",
  };
}
const greeting = (l: L): Block[] => [
  newCond("FirstName", l === "hi" ? "Namaste {{FirstName}} ji" : "Hello {{FirstName}}", l === "hi" ? "Namaste {{Business}} team" : "Hello {{Business}} team"), ", ",
];

interface Focus {
  lang: L;
  i: number;
  k: "text" | "then" | "else";
  start: number;
  end: number;
}

export function TemplateEditor({ target, lang, people, picks, who, setWho, tags, hasTags, onTagMade, backLabel, onClose, onSaved }: {
  target: EditTarget; lang: CardLang; people: PreviewContact[]; picks: QuickPicks; who: PreviewContact; setWho: (p: PreviewContact) => void;
  tags: WaTag[]; hasTags: boolean; onTagMade: (g: WaTag) => void; backLabel: string; onClose: () => void; onSaved: (abOf?: number) => void;
}): ReactElement {
  const toast = useToast();
  const source = target.t;
  const isB = !!target.versionB && !!source;
  /** A version B already runs (a draft one, say): edit its words instead of starting another. */
  const runningB = isB ? source?.version_b ?? null : null;
  const isNew = !source;
  const [d, setD] = useState<WaTemplate>(() => source ?? blank(target.cat));
  const [blocks, setBlocks] = useState<Record<L, Block[]>>(() => (source
    ? { en: parseBlocks(runningB ? runningB.text : source.text ?? ""), hi: parseBlocks(runningB ? runningB.text_hi : source.text_hi ?? "") }
    : { en: greeting("en"), hi: greeting("hi") }));
  const [tagIds, setTagIds] = useState<number[]>(() => (source?.tags ?? []).map((g) => g.id));
  const [edLang, setEdLang] = useState<L>(lang === "hi" ? "hi" : "en");
  const [marks, setMarks] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [drop, setDrop] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [focused, setFocused] = useState(false);
  const focus = useRef<Focus | null>(null);
  const caret = useRef<{ i: number; k: Focus["k"]; pos: number } | null>(null);

  const cat = (d.category || target.cat) as Cat;
  const tracked = TRACKED.includes(cat);
  const cold = cat === "outreach";
  useEffect(() => {
    if (cat === "offer") getCoupons().then((o) => setCoupons(o.coupons)).catch(() => setCoupons([]));
  }, [cat]);
  useLayoutEffect(() => {
    const c = caret.current;
    if (!c) return;
    caret.current = null;
    const el = document.querySelector<HTMLTextAreaElement>(`textarea[data-blk="${c.i}"][data-k="${c.k}"]`);
    if (el) {
      el.focus();
      el.setSelectionRange(c.pos, c.pos);
    }
  });

  const set = (patch: Partial<WaTemplate>) => {
    setD((x) => ({ ...x, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      return next;
    });
  };
  const pickCategory = (c: Cat) => set({
    category: c, kind: kindFor(c), type_name: CATEGORY_TYPES[c].includes(d.type_name ?? "") ? d.type_name : CATEGORY_TYPES[c][0],
    track: TRACKED.includes(c) ? d.track || "privacy" : "", step: c === "outreach" ? d.step || 1 : STEPS[c] ? Math.min(d.step || 1, STEPS[c] ?? 1) : 0,
    stage: c === "offer" ? d.stage || 1 : 0,
  });

  const parts = blocks[edLang];
  const setParts = (next: Block[]) => {
    setBlocks((b) => ({ ...b, [edLang]: next }));
    setErrors((e) => {
      const n = { ...e };
      delete n[edLang === "en" ? "text" : "text_hi"];
      return n;
    });
  };
  const upd = (i: number, patch: Partial<CondBlock> | string) =>
    setParts(parts.map((p, j) => (j !== i ? p : typeof patch === "string" ? patch : { ...(p as CondBlock), ...patch })));
  const remember = (i: number, k: Focus["k"]) => (e: { currentTarget: HTMLTextAreaElement }) => {
    focus.current = { lang: edLang, i, k, start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd };
    setFocused(true);
  };
  const insert = (key: string) => {
    const tok = `{{${key}}}`;
    const f = focus.current;
    const p = f && f.lang === edLang ? parts[f.i] : undefined;
    if (f && p !== undefined && (f.k === "text") === !isCond(p)) {
      const value = isCond(p) ? (f.k === "then" ? p.known : p.otherwise) : p;
      const next = value.slice(0, f.start) + tok + value.slice(f.end);
      upd(f.i, isCond(p) ? (f.k === "then" ? { known: next } : { otherwise: next }) : next);
      const pos = f.start + tok.length;
      focus.current = { ...f, start: pos, end: pos };
      caret.current = { i: f.i, k: f.k, pos };
      return;
    }
    const last = parts.map((x, j) => (isCond(x) ? -1 : j)).filter((j) => j >= 0).pop();
    if (last === undefined) setParts([...parts, tok]);
    else upd(last, (parts[last] as string) + tok);
  };

  const texts = { en: serializeBlocks(blocks.en), hi: serializeBlocks(blocks.hi) };
  const written = (l: L) => plainOf(blocks[l]).trim() !== "";
  const isDraftNow = !(written("en") && written("hi"));
  const filled = fillText(parts, who.who, edLang);

  // The checks, for the contact you preview as.
  const checks: { ok: boolean; t: string }[] = [];
  const missing = looseDetails(parts).filter((x) => !who.who[x]);
  if (missing.length) missing.forEach((x) => checks.push({ ok: false, t: `${DETAIL_LABEL[x]} is not known for ${who.short}, so the message reads oddly. Put it inside “If ${DETAIL_LABEL[x].toLowerCase()} is known”.` }));
  else checks.push({ ok: true, t: `Every detail outside a condition is known for ${who.short}.` });
  if (cat !== "quick_reply") checks.push(/Reply STOP|STOP to opt out/i.test(filled) ? { ok: true, t: "Ends with the opt-out line." } : { ok: false, t: "Add “Reply STOP to opt out.” at the end." });
  checks.push(filled.length <= 1000 ? { ok: true, t: `${filled.length} of 1,000 characters.` } : { ok: false, t: `${filled.length} characters: WhatsApp cuts it at 1,000.` });
  if (texts[edLang].length > 1000) checks.push({ ok: false, t: `With every condition the saved text is ${texts[edLang].length} characters; it can be up to 1,000.` });
  if (cat === "outreach" && (d.step ?? 1) === 1) checks.push(/zinwe\.io|https?:|www\./i.test(filled) ? { ok: false, t: "No link in a day-1 message." } : { ok: true, t: "No link in a day-1 message." });
  const other: L = edLang === "en" ? "hi" : "en";
  if (!written(other)) checks.push({ ok: false, t: `${LANG_NAME[other]} is not written yet, so this stays a draft.` });

  const addTag = async () => {
    const name = tagDraft.trim();
    if (!name) return;
    const have = tags.find((g) => g.name.toLowerCase() === name.toLowerCase());
    try {
      const g = have ?? (await addWaTag(name));
      if (!have) onTagMade(g);
      setTagIds((ids) => (ids.includes(g.id) ? ids : [...ids, g.id]));
      setTagDraft("");
    } catch (err) {
      toast(errText(err, "Couldn't add the tag."), "bad");
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      if (runningB && source) {
        await patchWaTemplate(runningB.id, { text: texts.en, text_hi: texts.hi });
        toast(isDraftNow ? "Version B saved. It is sent once both languages are written." : "Version B saved. Sends now split 50/50 with A.");
        onSaved(source.id as number);
        return;
      }
      if (isB && source) {
        await addWaVersion(source.id as number, texts.en, texts.hi);
        toast(isDraftNow ? "Version B saved. It is sent once both languages are written." : "Version B saved. Sends now split 50/50 with A.");
        onSaved(source.id as number);
        return;
      }
      const body: WaTemplate = { ...saveBody(d), category: cat, kind: kindFor(cat), text: texts.en, text_hi: texts.hi };
      if (hasTags) body.tag_ids = tagIds;
      else delete body.tag_ids;
      const saved = await saveWaTemplate(body);
      if (file && !cold) await uploadWaMedia(saved.id as number, file);
      else if (source?.media && (drop || cold)) await removeWaMedia(saved.id as number);
      toast((saved.draft ?? isDraftNow) ? "Saved as a draft. It reaches Today once both languages are written." : "Saved. The next send uses it.");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      toast(errText(err, "Couldn't save the template."), "bad");
      setBusy(false);
    }
  };

  const err = (k: string) => (errors[k] ? <span className="field-err" role="alert">{errors[k]}</span> : null);
  const textErr = errors[edLang === "en" ? "text" : "text_hi"];
  const otherErr = errors[edLang === "en" ? "text_hi" : "text"];
  const types = [...new Set([...(d.type_name ? [d.type_name] : []), ...CATEGORY_TYPES[cat]])];
  const usable = coupons.filter((c) => c.status === "live" || c.status === "scheduled" || c.id === source?.coupon);
  const perf = source && cat !== "quick_reply" ? numbersOf(source).total : null;
  const quick = [picks.first, picks.noFirst, picks.noNames].filter((p): p is PreviewContact => !!p);
  const quickLabel = (p: PreviewContact) => (p === picks.first ? p.title : p === picks.noFirst ? `${p.who.Business} (no first name)` : `${p.who.Business} (no names)`);
  const segs = plainOf(parts).trim() ? segments(parts, who.who, edLang) : null;
  const name = isB ? `Version B of ${source?.name}` : isNew ? "New template" : source?.name;
  const media = <MediaCard t={{ ...d, media: drop ? null : d.media }} />;

  let when: ReactElement;
  if (cat === "outreach") {
    when = <label className="wt-f">When it goes<input type="number" min={1} max={90} value={d.step ?? 1} onChange={(e) => set({ step: Number(e.target.value) })} /><small>A day from 1 to 90; one message a day at most.</small>{err("step")}</label>;
  } else if (cat === "offer") {
    when = <label className="wt-f">When it goes<select value={d.stage ?? 1} onChange={(e) => set({ stage: Number(e.target.value) })}>{[1, 2, 3].map((x) => <option key={x} value={x}>Stage {x}</option>)}</select><small>The stage whose live code it carries.</small>{err("stage")}</label>;
  } else if (STEPS[cat]) {
    when = <label className="wt-f">When it goes<select value={d.step || 1} onChange={(e) => set({ step: Number(e.target.value) })}>{Array.from({ length: STEPS[cat] ?? 1 }, (_, i) => i + 1).map((x) => <option key={x} value={x}>Step {x}</option>)}</select><small>Its step in the path after a YES.</small>{err("step")}</label>;
  } else {
    when = <div className="wt-f is-static">When it goes<span className="wt-static">{cat === "demo_call" ? "On a setup error" : "When they write"}</span><small>{cat === "quick_reply" ? "What they said that this answers: put it in the type." : "Its step in the path after a YES."}</small></div>;
  }

  return (
    <div className="wt-ed">
      <div className="wt-edl">
        <div className="wt-crumb"><button type="button" onClick={onClose}>← {backLabel}</button><span>/</span><span>{name}</span></div>
        {isB ? (
          <p className="wt-perfl" style={{ margin: 0 }}>Version B keeps {source?.name}’s category, type, step and tags; only the words change.</p>
        ) : (
          <>
            <div className="wt-grid2">
              <label className="wt-f">Name<input type="text" value={d.name} maxLength={120} placeholder="Made from the category, type and day when left empty" onChange={(e) => set({ name: e.target.value })} />{err("name")}</label>
              <label className="wt-f">Category<select value={cat} onChange={(e) => pickCategory(e.target.value as Cat)}>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
              <label className="wt-f">Type<input type="text" list="wt-types" value={d.type_name ?? ""} maxLength={60} onChange={(e) => set({ type_name: e.target.value })} /><datalist id="wt-types">{types.map((x) => <option key={x} value={x} />)}</datalist><small>What this step does, like Intro or Need discovery.</small>{err("type_name")}</label>
              {when}
              {tracked ? (
                <label className="wt-f">Track<select value={d.track ?? ""} onChange={(e) => set({ track: e.target.value as WaTrack })}>{TRACKS.map((x) => <option key={x} value={x}>{TRACK_LABEL[x]}</option>)}</select><small>Only contacts with this Track get it.</small>{err("track")}</label>
              ) : null}
              {cat === "offer" ? (
                <>
                  <label className="wt-f">Coupon code<select value={d.coupon ?? 0} onChange={(e) => set({ coupon: Number(e.target.value) || null })}><option value={0}>No code</option>{usable.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.percent_off}% · {c.status}</option>)}</select><small>Live or yet to start; ended codes are hidden.</small>{err("coupon")}</label>
                  <div className="wt-f">Festival code<label className="wt-ck"><input type="checkbox" checked={!!d.event} onChange={(e) => set({ event: e.target.checked })} />Staff pick it by hand</label><small>The queue never picks a festival code.</small></div>
                </>
              ) : null}
            </div>
            {hasTags ? (
              <div className="wt-f">Tags
                <div className="wt-tagsed">
                  {tagIds.map((id) => tags.find((g) => g.id === id)).filter((g): g is WaTag => !!g).map((g) => (
                    <span key={g.id} className="wt-tag"><span className="wt-dot" style={{ background: g.color }} />{g.name}<button type="button" aria-label={`Remove tag ${g.name}`} onClick={() => setTagIds((ids) => ids.filter((x) => x !== g.id))}>×</button></span>
                  ))}
                  <input type="text" value={tagDraft} maxLength={60} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addTag(); } }} placeholder="+ Add a tag" aria-label="Add a tag" list="wt-taglist" />
                  <datalist id="wt-taglist">{tags.map((g) => <option key={g.id} value={g.name} />)}</datalist>
                  <button type="button" className="wt-btn" onClick={() => void addTag()}>Add</button>
                </div>
                <small>Your own labels. A new name here becomes a tag in the menu on the left.</small>
              </div>
            ) : null}
            {!cold ? (
              <div className="wt-f">Picture or video <small>Optional. It shows as a card in the bubble; Today shows it to attach in the chat.</small>
                <MediaPicker t={{ ...d, kind: "nurture" }} cold={false} file={file} setFile={setFile} drop={drop} setDrop={setDrop} />
              </div>
            ) : null}
          </>
        )}
        <div className="wt-tabs" role="group" aria-label="Message language">
          {(["en", "hi"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={edLang === l} onClick={() => { setEdLang(l); focus.current = null; setFocused(false); }}>{LANG_NAME[l]}{written(l) ? "" : " · not written"}</button>
          ))}
        </div>
        <div className="wt-blocks">
          {parts.map((p, i) => (isCond(p) ? (
            <div key={i} className="wt-block is-cond">
              <div className="wt-blockh">If
                <select value={p.detail} aria-label="Detail" onChange={(e) => upd(i, { detail: e.target.value, open: `{{#if ${e.target.value}}}` })}>
                  {DETAILS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  {DETAILS.some(([k]) => k === p.detail) ? null : <option value={p.detail}>{DETAIL_LABEL[p.detail] ?? p.detail}</option>}
                </select>is known
                <button type="button" className="wt-x" onClick={() => setParts(parts.filter((_, j) => j !== i))}>Remove</button>
              </div>
              <div className="wt-branch"><span>Then show</span><textarea data-blk={i} data-k="then" value={p.known} aria-label="Text when the detail is known" onChange={(e) => { upd(i, { known: e.target.value }); remember(i, "then")(e); }} onFocus={remember(i, "then")} onSelect={remember(i, "then")} /></div>
              <div className="wt-branch"><span className="is-else">Otherwise</span><textarea data-blk={i} data-k="else" value={p.otherwise} aria-label="Text when the detail is not known" placeholder="Leave empty to skip this part" onChange={(e) => { upd(i, { otherwise: e.target.value }); remember(i, "else")(e); }} onFocus={remember(i, "else")} onSelect={remember(i, "else")} /></div>
            </div>
          ) : (
            <div key={i} className="wt-block">
              <div className="wt-blockh">Text<button type="button" className="wt-x" onClick={() => setParts(parts.filter((_, j) => j !== i))}>Remove</button></div>
              <textarea data-blk={i} data-k="text" value={p} aria-label="Text" placeholder="Write the message. Insert a detail below." onChange={(e) => { upd(i, e.target.value); remember(i, "text")(e); }} onFocus={remember(i, "text")} onSelect={remember(i, "text")} />
            </div>
          )))}
        </div>
        {textErr ? <p className="wt-errs" role="alert">{textErr}</p> : null}
        {otherErr ? <p className="wt-errs" role="alert">{LANG_NAME[other]}: {otherErr}</p> : null}
        <div className="wt-vars"><span>Insert a detail</span>
          {DETAILS.map(([k, l]) => <button key={k} type="button" className="wt-var" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k)}>{l}</button>)}
          <span>{focused ? "It goes where you were typing." : "Click into a box first, or it goes at the end."}</span>
        </div>
        <div className="wt-add">
          <button type="button" className="wt-btn" onClick={() => setParts([...parts, ""])}>+ Text</button>
          <button type="button" className="wt-btn" onClick={() => setParts([...parts, newCond("FirstName", edLang === "hi" ? "{{FirstName}} ji, " : "{{FirstName}}, ", "")])}>+ If a detail is known</button>
          <span className="wt-perfl">A condition shows one text when the detail is known and another when it is not, for example "Hello Rohit" or "Hello Sharma Exports team".</span>
        </div>
        <div className="wt-savebar">
          <button type="button" className="wt-btn is-dark" disabled={busy} onClick={() => void save()}>{busy ? "Saving" : "Save"}</button>
          <button type="button" className="wt-btn" onClick={onClose}>Cancel</button>
          <span className="wt-perfl">{isB ? "Version B starts with no sends; sends split 50/50 with A until each has 50." : isDraftNow ? "Both languages are needed before it is sent." : "Changes apply to the next send, not to sent messages."}</span>
        </div>
      </div>
      <aside className="wt-edr" aria-label="Preview">
        <div className="wt-f">Preview as
          <div className="wt-who">
            {quick.map((p) => <button key={p.id} type="button" aria-pressed={p.id === who.id} onClick={() => setWho(p)}>{quickLabel(p)}</button>)}
            {quick.some((p) => p.id === who.id) ? null : <button type="button" aria-pressed="true">{who.label}</button>}
            {people.length > 3 ? (
              <WhoPicker all={people} picks={picks} value={who} onPick={setWho}>
                {(open) => <button type="button" aria-haspopup="dialog" onClick={(e) => open(e.currentTarget)}>Another contact…</button>}
              </WhoPicker>
            ) : null}
          </div>
        </div>
        <div className="wt-facts">{DETAILS.map(([k, l]) => <span key={k} style={{ display: "contents" }}><span>{l}</span><span>{who.who[k] || "— not known"}</span></span>)}</div>
        <label className="sw"><input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} /><span className="tr"><span /></span>Show the conditions in the preview</label>
        <div className="wt-phone">
          <div className="wt-phonebar"><span className="wt-av">{who.initials}</span><div><b>{who.title}</b><div className="wt-perfl">{LANG_NAME[edLang]} · WhatsApp</div></div></div>
          <div className="wt-phonebody">
            <div className="wt-bubble">
              {segs ? media : null}
              {segs ? segs.map((s, i) => <span key={i} className={marks && s.kind ? `wt-seg is-${s.kind}` : undefined}>{s.t}</span>) : `Start writing on the left. The message shows here as ${who.short} will see it.`}
              <span className="wt-time">10:14 ✓✓</span>
            </div>
          </div>
        </div>
        <div className="wt-checks">{checks.map((c) => <div key={c.t} className={"wt-check " + (c.ok ? "is-ok" : "is-warn")}><i>{c.ok ? "✓" : "!"}</i><span>{c.t}</span></div>)}</div>
        {perf && perf.sends > 0 ? (
          <div className="wt-perf">
            <div className="wt-big"><b>{perf.rate} %</b><span className="wt-perfl">replies, {perf.sends} sent</span></div>
            <div className="wt-bar"><i className={band(perf.rate, perf.sends)} style={{ width: `${perf.rate}%` }} /></div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
