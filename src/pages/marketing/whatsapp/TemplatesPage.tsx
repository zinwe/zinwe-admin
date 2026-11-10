/**
 * Marketing -> WhatsApp -> Templates (owner, 10 Nov 2026; board AdminWaTemplates in _wa2). A menu like ChatGPT's
 * sidebar (categories in path order, Quick reply, your tags, Archived, Older templates), then every message as a
 * WhatsApp card rendered for a real contact, with its numbers. Edit opens TemplateEditor in place of the cards.
 *
 * Built against the wa2 API: tags, per-language stats, version B and reach. On an older server those parts hide and
 * the cards show the text as stored.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useToast } from "../../../components/Toast";
import { ApiError } from "../../../lib/api";
import {
  addWaTag, duplicateWaTemplate, getWaReach, getWaTags, keepWaVersion, patchWaTemplate, saveWaTemplate, type WaContact, type WaReach, type WaTag,
  type WaTemplate,
} from "../../../lib/whatsappApi";

/** An older server has no route for it: do it with the routes it has. */
const missing = (err: unknown): boolean => err instanceof ApiError && (err.status === 404 || err.status === 405);
import { CATEGORY_LABEL, errText, TRACKED, trackName } from "./shared";
import { condDetails, DETAIL_LABEL, fillText, isWritten, looseDetails, parseBlocks, plainOf, segments } from "./templateBlocks";
import {
  BADGE, band, bandWord, DESC, dayPill, isDraft, NEXT, numbersOf, PATH_CATS, pathOrder, previewOf, quickPicks, SAMPLES, SUB, sumOf, whenOf,
  type Cat, type PreviewContact,
} from "./templateModel";
import { saveBody, TemplateEditor, type EditTarget } from "./TemplateEditor";
import { MediaCard, Pct, Segs, Svg, WhoPicker, type CardLang } from "./templateParts";
import "../../../styles/wa-templates.css";

type View = Cat | "all" | "archived" | "older";
const KIND_NAME = { en: "English", hi: "Hinglish" } as const;

interface CardProps {
  t: WaTemplate;
  lang: CardLang;
  who: PreviewContact;
  reach: WaReach | null;
  tagsById: Map<number, WaTag>;
  ver: "A" | "B";
  setVer: (v: "A" | "B") => void;
  menuOpen: boolean;
  toggleMenu: () => void;
  onEdit: () => void;
  onDup: () => void;
  onArchive: () => void;
  onTryB: () => void;
  onKeep: (v: "A" | "B") => void;
}

function TemplateCard({ t, lang, who, reach, tagsById, ver, setVer, menuOpen, toggleMenu, onEdit, onDup, onArchive, onTryB, onKeep }: CardProps): ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) toggleMenu();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") toggleMenu();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen, toggleMenu]);

  const cat = t.category as Cat;
  const quick = cat === "quick_reply";
  const draft = isDraft(t);
  const n = numbersOf(t);
  const b = t.version_b ?? null;
  const showB = !!b && ver === "B";
  const src = { en: showB ? b.text : t.text ?? "", hi: showB ? b.text_hi : t.text_hi ?? "" };
  const blocks = { en: parseBlocks(t.text ?? ""), hi: parseBlocks(t.text_hi ?? "") };
  const shown = { en: parseBlocks(src.en), hi: parseBlocks(src.hi) };
  const langs: ("en" | "hi")[] = lang === "both" ? ["en", "hi"] : [lang];
  const conds = [...new Set([...condDetails(blocks.en), ...condDetails(blocks.hi)])];
  const loose = [...new Set([...looseDetails(shown.en), ...looseDetails(shown.hi)])];
  const reachLines = reach && reach.total
    ? [
      ...conds.filter((d) => d !== "Business").map((d) => ({ warn: false, t: `${DETAIL_LABEL[d]} known for ${reach.known[d]} of ${reach.total}; ${reach.total - reach.known[d]} get the Otherwise text` })),
      ...loose.filter((d) => reach.known[d] < reach.total).map((d) => ({ warn: true, t: `${DETAIL_LABEL[d]} is empty for ${reach.total - reach.known[d]} of ${reach.total} contacts. Put it inside a condition.` })),
    ]
    : [];
  const tags = (t.tags ?? []).map((g) => tagsById.get(g.id) ?? g);
  const sent = n.total.sends;
  const rate = n.total.rate;
  const hasPerf = !quick && sent > 0;
  const weak = !b && !quick && sent >= 30 && rate < 15;
  const a = n.a;
  const bn = n.b;
  // A B still missing a language is never sent (everyone gets A meanwhile), and Keep B is refused.
  const bDraft = !!b && (b.draft ?? !(isWritten(b.text) && isWritten(b.text_hi)));
  const canKeep = !!a && !!bn && !bDraft && a.sends >= 50 && bn.sends >= 50;
  const bWins = !!a && !!bn && bn.rate > a.rate;
  const abLine = a && bn
    ? bDraft ? "Version B is a draft: everyone gets A until both its languages are written." : (canKeep
      ? (bWins ? `B wins after 50 sends each: ${bn.rate} % vs ${a.rate} %.` : `A holds after 50 sends each: ${a.rate} % vs ${bn.rate} %.`)
      : `Sends split 50/50 until each version has 50. ${bn.sends ? `A ${a.rate} %, B ${bn.rate} % so far.` : "B has no sends yet."}`)
    : "";
  const en = n.en;
  const hi = n.hi;
  const lead = en && hi ? en.rate - hi.rate : 0;
  const nextLabel = NEXT[cat];
  const testText = fillText(shown[langs[0]], who.who, langs[0]);
  const media = <MediaCard t={t} />;
  return (
    <article className="wc-card" aria-label={t.name}>
      <header className="wc-top">
        <span className={"wc-av" + (quick ? " is-quick" : "")} aria-hidden="true">{BADGE[cat] ?? "?"}</span>
        <div className="wc-tt"><b>{t.name}</b><span>{CATEGORY_LABEL[cat]}{TRACKED.includes(cat) ? ` · ${trackName(t.track)}` : ""} · {whenOf(t)}</span></div>
        {hasPerf ? <Pct rate={rate} sends={sent} tip={`${n.total.replies} replies of ${sent} sent`} /> : null}
        {draft ? <span className="wt-pill is-draft">Draft</span> : null}
        <div className="wc-acts" ref={menuRef}>
          <button type="button" className="wc-icon" aria-label="More actions" aria-haspopup="menu" aria-expanded={menuOpen} onClick={toggleMenu}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
          </button>
          {menuOpen ? (
            <div className="wc-menu" role="menu">
              <button type="button" role="menuitem" onClick={onEdit}>{draft ? "Write" : "Edit"}</button>
              <button type="button" role="menuitem" onClick={onDup}>Duplicate</button>
              <button type="button" role="menuitem" onClick={onArchive}>{t.archived ? "Bring back" : "Archive"}</button>
            </div>
          ) : null}
        </div>
      </header>
      {a && bn ? (
        <div className="wc-ab" role="group" aria-label="Versions">
          {([["A", a], ["B", bn]] as const).map(([k, x]) => (
            <button key={k} type="button" aria-pressed={ver === k} onClick={() => setVer(k)}>Version {k} · {x.sends ? `${x.rate} %` : "new"}</button>
          ))}
        </div>
      ) : null}
      <div className={"wc-chat" + (lang === "both" ? " is-both" : "")}>
        <span className="wc-day">{dayPill(t)}</span>
        {langs.map((l) => {
          const written = plainOf(shown[l]).trim() !== "";
          return (
            <div key={l} className="wc-msg">
              {lang === "both" ? <span className="wt-chatlang">{KIND_NAME[l].toUpperCase()}</span> : null}
              <div className={"wt-bubble" + (written ? "" : " is-draft")}>
                {written ? media : null}
                {written ? <Segs segs={segments(shown[l], who.who, l)} marks={false} /> : `${KIND_NAME[l]} is not written yet. A draft never reaches Today.`}
                <span className="wt-time">10:14 ✓✓</span>
              </div>
            </div>
          );
        })}
      </div>
      {weak ? (
        <div className="wc-strip is-weak"><span>Weak: {rate} % replies after {sent} sent. Test a second version against it.</span><button type="button" className="wt-btn" onClick={onTryB}>Try a new version</button></div>
      ) : null}
      {a && bn ? (
        <div className="wc-strip is-ab"><span>{abLine}</span>{bDraft ? <button type="button" className="wt-btn" onClick={onTryB}>Write version B</button> : null}{canKeep ? <button type="button" className="wt-btn is-dark" onClick={() => onKeep(bWins ? "B" : "A")}>{bWins ? "Keep B" : "Keep A"}</button> : null}</div>
      ) : null}
      <dl className="wc-facts">
        <div><dt>Category</dt><dd>{CATEGORY_LABEL[cat]} · {t.type_name || "No type yet"}</dd></div>
        <div><dt>When it goes</dt><dd>{whenOf(t)}</dd></div>
        {TRACKED.includes(cat) ? <div><dt>Track</dt><dd><span className="wt-pill">{trackName(t.track)}</span></dd></div> : null}
        <div><dt>Changes with</dt><dd>{conds.length ? <span className="wt-pill is-cond">{conds.map((d) => DETAIL_LABEL[d]).join(" · ")}</span> : <span className="wc-quiet">Same for everyone</span>}</dd></div>
        <div><dt>Languages</dt><dd>{(["en", "hi"] as const).map((l) => `${KIND_NAME[l]}${isWritten(l === "en" ? t.text : t.text_hi) ? " ✓" : " · not written"}`).join("  ·  ")}</dd></div>
        {reachLines.length ? <div><dt>Who gets what</dt><dd className="wc-reach">{reachLines.map((x) => <span key={x.t} className={x.warn ? "is-warn" : undefined}>{x.t}</span>)}</dd></div> : null}
        {t.tags ? <div><dt>Tags</dt><dd>{tags.length ? tags.map((g) => <span key={g.id} className="wt-tag"><span className="wt-dot" style={{ background: g.color }} />{g.name}</span>) : <span className="wc-quiet">No tags</span>}</dd></div> : null}
      </dl>
      <div className="wc-perf">
        {hasPerf ? (
          <>
            <div className="wc-meter">
              <div className="wc-ml"><span>Replies</span><b>{rate} %</b></div>
              <div className="wt-bar"><i className={band(rate, sent)} style={{ width: `${rate}%` }} /></div>
              <span className="wt-perfl">{n.total.replies} replies of {sent} sent · {bandWord(rate)}</span>
            </div>
            {en && hi ? (
              <div className="wc-langs">
                <span className={`wt-pct ${band(en.rate, en.sends)}${lead >= 8 ? " is-win" : ""}`}>English {en.rate} %</span>
                <span className={`wt-pct ${band(hi.rate, hi.sends)}${-lead >= 8 ? " is-win" : ""}`}>Hinglish {hi.rate} %</span>
                {sent >= 40 && Math.abs(lead) >= 8 ? <span className="wt-pill is-auto" title="Set by Zinwe when one language gets 8+ points more replies, after 20 sends each">{lead < 0 ? "Hinglish" : "English"} does better · auto</span> : null}
              </div>
            ) : null}
            {nextLabel && n.next !== null ? (
              <div className="wc-meter">
                <div className="wc-ml"><span>{nextLabel.charAt(0).toUpperCase() + nextLabel.slice(1)}</span><b>{n.next} %</b></div>
                <div className="wt-bar"><i style={{ width: `${n.next}%` }} /></div>
              </div>
            ) : null}
          </>
        ) : <span className="wt-perfl">{quick ? `${sent} sent · answers a message, not scored` : draft ? "Draft: no sends yet" : "Not sent yet"}</span>}
      </div>
      <footer className="wc-foot">
        <button type="button" className="wt-btn is-dark" onClick={onEdit}>{draft ? "Write" : "Edit"}</button>
        {!draft ? (
          <a className="wt-btn" href={`https://wa.me/?text=${encodeURIComponent(testText)}`} target="_blank" rel="noopener noreferrer" title={`Opens WhatsApp with this message as ${who.short} gets it. Send it to yourself.`}>
            <Svg d="M22 2 11 13M22 2 15 22l-4-9-9-4z" size={16} />Test on my WhatsApp
          </a>
        ) : null}
        <button type="button" className="wt-btn is-ghost" onClick={onDup}>Duplicate</button>
      </footer>
    </article>
  );
}

export function TemplatesPage({ templates, contacts, reload, lang, newTick, older, olderCount }: {
  templates: WaTemplate[]; contacts: WaContact[]; reload: () => void; lang: CardLang; newTick: number; older: ReactElement; olderCount: number;
}): ReactElement {
  const toast = useToast();
  const campaign = useMemo(() => templates.filter((t) => t.category && !t.version_of), [templates]);
  const live = campaign.filter((t) => !t.archived);
  const archived = campaign.filter((t) => t.archived);
  const [view, setView] = useState<View>(campaign.length === 0 && olderCount > 0 ? "older" : "all");
  const [tag, setTag] = useState<number | null>(null);
  const [onlyDrafts, setOnlyDrafts] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"path" | "best">("path");
  const [menu, setMenu] = useState<number | null>(null);
  const [ver, setVer] = useState<Record<number, "A" | "B">>({});
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [undo, setUndo] = useState<WaTemplate | null>(null);
  const [tagList, setTagList] = useState<WaTag[] | null>(null);
  const [reach, setReach] = useState<WaReach | null>(null);

  useEffect(() => {
    getWaTags().then(setTagList).catch(() => setTagList(null));
    getWaReach().then(setReach).catch(() => setReach(null));
  }, [templates]);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  // Tags: the server's list, else the ones the templates carry (an older server has neither: the section hides).
  const tags = useMemo(() => {
    if (tagList) return tagList;
    const seen = new Map<number, WaTag>();
    templates.forEach((t) => (t.tags ?? []).forEach((g) => seen.set(g.id, g)));
    return [...seen.values()].sort((x, y) => x.name.localeCompare(y.name));
  }, [tagList, templates]);
  const tagsById = useMemo(() => new Map(tags.map((g) => [g.id, g])), [tags]);
  const hasTags = tagList !== null || templates.some((t) => Array.isArray(t.tags));

  const people = useMemo(() => contacts.filter((c) => c.status !== "stop" && c.campaign_status !== "opted_out").map(previewOf), [contacts]);
  const picks = useMemo(() => quickPicks(people, reach?.examples), [people, reach]);
  const [whoId, setWhoId] = useState<number | null>(null);
  const pool = people.length ? people : SAMPLES;
  const who = pool.find((p) => p.id === whoId) ?? picks.first ?? pool[0];

  const openNew = () => {
    const c: Cat = view !== "all" && view !== "archived" && view !== "older" ? view : "outreach";
    setEditing({ t: null, cat: c });
    setMenu(null);
  };
  const lastTick = useRef(newTick);
  useEffect(() => {
    if (newTick !== lastTick.current) {
      lastTick.current = newTick;
      openNew();
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const pickView = (v: View) => {
    setView(v);
    setTag(null);
    setOnlyDrafts(false);
    setEditing(null);
    setMenu(null);
    setSideOpen(false);
  };
  const pickTag = (id: number) => {
    setTag(tag === id ? null : id);
    if (view === "older" || view === "archived") setView("all");
    setEditing(null);
    setMenu(null);
    setSideOpen(false);
  };

  const needle = q.trim().toLowerCase();
  const inView = (t: WaTemplate) => (onlyDrafts ? isDraft(t) : true) && (view === "all" || t.category === view);
  const inTag = (t: WaTemplate) => !tag || (t.tags ?? []).some((g) => g.id === tag);
  const inQ = (t: WaTemplate) => !needle || `${t.name} ${t.type_name ?? ""} ${plainOf(parseBlocks(t.text ?? ""))} ${plainOf(parseBlocks(t.text_hi ?? ""))}`.toLowerCase().includes(needle);
  const rateKey = (t: WaTemplate) => (t.category === "quick_reply" ? -2 : numbersOf(t).total.sends ? numbersOf(t).total.rate : -1);
  const rows = (view === "archived" ? archived : live.filter(inView)).filter(inTag).filter(inQ)
    .sort((x, y) => (sort === "best" ? rateKey(y) - rateKey(x) : 0) || pathOrder(x) - pathOrder(y));
  const vis = view === "archived" ? [] : live.filter(inView).filter(inTag);
  const visSum = sumOf(vis);
  const drafts = live.filter(isDraft);
  const written = live.length - drafts.length;
  const allSum = sumOf(live);
  const tagName = tag ? tagsById.get(tag)?.name ?? "Tag" : "";
  const title = tag ? tagName : view === "all" ? (onlyDrafts ? "Drafts to write" : "All templates") : view === "archived" ? "Archived" : view === "older" ? "Older templates" : CATEGORY_LABEL[view];
  const desc = tag
    ? `Templates you tagged ${tagName}. Tags are your own; add them in a template.`
    : view === "archived" ? "Archived templates are never sent. Their numbers stay in Analytics."
      : view === "older" ? "The templates from before the 90-day campaign. Campaigns on three touches still use them."
        : DESC[view];

  /** Archive or bring back: PATCH {archived}, or PUT the whole row on an older server. */
  const setArchived = async (t: WaTemplate, archived: boolean) => {
    try {
      await patchWaTemplate(t.id as number, { archived });
    } catch (err) {
      if (!missing(err)) throw err;
      await saveWaTemplate({ ...saveBody(t), archived });
    }
  };
  const bringBack = async (t: WaTemplate) => {
    try {
      await setArchived(t, false);
      toast(`Back in ${CATEGORY_LABEL[t.category as Cat]}.`);
      reload();
    } catch (err) {
      toast(errText(err, "Couldn't bring it back."), "bad");
    }
  };
  const duplicate = async (t: WaTemplate) => {
    setMenu(null);
    try {
      try {
        await duplicateWaTemplate(t.id as number);
      } catch (err) {
        if (!missing(err)) throw err;
        const body = saveBody(t);
        delete body.id;
        await saveWaTemplate({ ...body, name: `${t.name} (copy)`.slice(0, 120), archived: false });
      }
      toast("Duplicated. The copy starts with no numbers.");
      reload();
    } catch (err) {
      toast(errText(err, "Couldn't duplicate it."), "bad");
    }
  };
  const archive = async (t: WaTemplate) => {
    setMenu(null);
    if (t.archived) {
      await bringBack(t);
      return;
    }
    try {
      await setArchived(t, true);
      setUndo(t);
      reload();
    } catch (err) {
      toast(errText(err, "Couldn't archive it."), "bad");
    }
  };
  const keep = async (t: WaTemplate, v: "A" | "B") => {
    try {
      await keepWaVersion(t.id as number, v);
      setVer((x) => ({ ...x, [t.id as number]: "A" }));
      toast(`${v === "B" ? "Version B" : "Version A"} is now the message. Both versions keep their numbers in Analytics.`);
      reload();
    } catch (err) {
      toast(errText(err, "Couldn't end the test."), "bad");
    }
  };
  const addTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    try {
      const made = await addWaTag(name);
      setTagList((l) => [...(l ?? tags), made].sort((x, y) => x.name.localeCompare(y.name)));
      setNewTag("");
      setNewTagOpen(false);
      toast(`Tag “${made.name}” added. Add it to templates when you edit them.`);
    } catch (err) {
      toast(errText(err, "Couldn't add the tag."), "bad");
    }
  };

  const item = (on: boolean, pick: () => void, label: string, sub: string, chip: ReactNode, dot?: string) => (
    <button type="button" className="wt-item" aria-pressed={on} onClick={pick}>
      {dot ? <span className="wt-dot" style={{ background: dot }} /> : null}
      <span className="wt-item__t"><b>{label}</b><small>{sub}</small></span>
      {chip}
    </button>
  );
  const catItem = (c: Cat) => {
    const list = live.filter((t) => t.category === c);
    const s = sumOf(list);
    const quick = c === "quick_reply";
    return (
      <Fragment key={c}>
        {item(view === c && !tag && !onlyDrafts, () => pickView(c), CATEGORY_LABEL[c], `${list.length} · ${SUB[c]}`,
          quick ? <Pct rate={0} sends={0} quiet="not scored" tip="Quick replies answer a message, so they are not scored" />
            : <Pct rate={s.rate} sends={s.sends} tip={s.sends ? `${s.rate} % of ${s.sends} sent got a reply` : "Not sent yet"} />)}
      </Fragment>
    );
  };

  let main: ReactElement;
  if (editing) {
    main = (
      <TemplateEditor key={editing.t?.id ?? `new-${editing.cat}`} target={editing} lang={lang} people={pool} picks={picks} who={who} setWho={(p) => setWhoId(p.id)}
        tags={tags} hasTags={hasTags} onTagMade={(g) => setTagList((l) => [...(l ?? tags), g].sort((x, y) => x.name.localeCompare(y.name)))}
        backLabel={editing.t ? CATEGORY_LABEL[editing.t.category as Cat] : view === "all" || view === "archived" || view === "older" ? "All templates" : CATEGORY_LABEL[view]}
        onClose={() => setEditing(null)}
        onSaved={(abOf) => {
          if (abOf) setVer((x) => ({ ...x, [abOf]: "B" }));
          setEditing(null);
          if (editing.t?.archived) setView(editing.t.category as Cat);
          reload();
        }} />
    );
  } else if (view === "older") {
    main = (
      <>
        <div className="wt-head"><div><h2>{title}</h2><p>{desc}</p></div></div>
        <div className="wt-older mk">{older}</div>
      </>
    );
  } else {
    main = (
      <>
        <div className="wt-head">
          <div><h2>{title}</h2><p>{desc}</p></div>
          <div className="wt-tools">
            <WhoPicker all={people} picks={picks} value={who} onPick={(p) => setWhoId(p.id)} />
            <label className="wt-sel">Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as "path" | "best")} aria-label="Sort">
                <option value="path">Path order</option>
                <option value="best">Best working first</option>
              </select>
            </label>
          </div>
        </div>
        <div className="wt-stats">
          <span><b>{vis.length}</b> templates</span><span>·</span><span><b>{visSum.sends}</b> sent</span><span>·</span><span>replies</span><Pct rate={visSum.rate} sends={visSum.sends} />
          <span className="wc-prog">
            <span>Written {written} of {live.length}</span>
            <span className="wt-bar wc-progbar"><i className="is-good" style={{ width: `${Math.round((written / Math.max(1, live.length)) * 100)}%` }} /></span>
          </span>
          {drafts.length ? (
            <button type="button" className="wt-btn is-dark" onClick={() => {
              const next = drafts.slice().sort((x, y) => pathOrder(x) - pathOrder(y))[0];
              if (next) setEditing({ t: next, cat: next.category as Cat });
            }}>Write next draft</button>
          ) : null}
        </div>
        {rows.length ? (
          <div className="wc-grid">
            {rows.map((t) => {
              const id = t.id as number;
              return (
                <TemplateCard key={id} t={t} lang={lang} who={who} reach={reach} tagsById={tagsById} ver={t.version_b && ver[id] === "B" ? "B" : "A"}
                  setVer={(v) => setVer((x) => ({ ...x, [id]: v }))} menuOpen={menu === id} toggleMenu={() => setMenu((m) => (m === id ? null : id))}
                  onEdit={() => { setMenu(null); setEditing({ t, cat: t.category as Cat }); }}
                  onDup={() => void duplicate(t)} onArchive={() => void archive(t)}
                  onTryB={() => setEditing({ t, cat: t.category as Cat, versionB: true })} onKeep={(v) => void keep(t, v)} />
              );
            })}
          </div>
        ) : <div className="wt-empty">{needle ? "No template matches that search." : "No templates here yet. Pick another category or tag, or make a new one."}</div>}
        <div className="wt-foot">Replies = replies ÷ sent, last 30 days. The second bar is the step each category is for: YES for Outreach, Paid for Offer, Track set for Engage, Next step for Demo video, Setup and Demo call, Got one for Testimonial. Quick replies answer a message, so they are not scored. The chips beside each category and tag use the same reply rate: green 40 % and up, orange 15–39 %, red under 15 %.</div>
      </>
    );
  }

  return (
    <div className="wt-wrap">
      <div className="wt-in">
        <aside className={"wt-side" + (sideOpen ? " is-open" : "")} aria-label="Template categories and tags">
          <button type="button" className="wt-sidetoggle" aria-expanded={sideOpen} onClick={() => setSideOpen((o) => !o)}>
            <span>{title}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d={sideOpen ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg>
          </button>
          <div className="wt-sidebody">
            <button type="button" className="wt-new" onClick={() => { setSideOpen(false); openNew(); }}>
              <Svg d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />New template
            </button>
            <label className="wt-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
              <input type="search" value={q} onChange={(e) => { setQ(e.target.value); if (view === "older") setView("all"); setEditing(null); }} placeholder="Search templates" aria-label="Search templates" />
            </label>
            <div className="wt-sec">
              {item(view === "all" && !tag && !onlyDrafts, () => pickView("all"), "All templates", `${live.length} templates · ${drafts.length} drafts`,
                <Pct rate={allSum.rate} sends={allSum.sends} tip="Replies ÷ sent, last 30 days" />)}
              {item(onlyDrafts, () => { pickView("all"); setOnlyDrafts(!onlyDrafts); }, "Drafts to write", drafts.length ? "Write them in path order" : "All written",
                <span className="wt-pct is-mid">{drafts.length}</span>)}
            </div>
            <div className="wt-sec">
              <div className="wt-sech"><span>CAMPAIGN PATH</span></div>
              {PATH_CATS.map(catItem)}
            </div>
            <div className="wt-sec">
              <div className="wt-sech"><span>ANY TIME</span></div>
              {catItem("quick_reply")}
            </div>
            {hasTags ? (
              <div className="wt-sec">
                <div className="wt-sech"><span>TAGS</span><button type="button" aria-expanded={newTagOpen} onClick={() => setNewTagOpen((o) => !o)}>+ New tag</button></div>
                {newTagOpen ? (
                  <form className="wt-newtag" onSubmit={(e) => { e.preventDefault(); void addTag(); }}>
                    <input type="text" value={newTag} maxLength={60} onChange={(e) => setNewTag(e.target.value)} placeholder="Tag name, like Pune firms" aria-label="New tag name" autoFocus />
                    <button type="submit">Add</button>
                  </form>
                ) : null}
                {tags.map((g) => {
                  const list = live.filter((t) => (t.tags ?? []).some((x) => x.id === g.id));
                  const s = sumOf(list);
                  return (
                    <Fragment key={g.id}>
                      {item(tag === g.id, () => pickTag(g.id), g.name, `${list.length} ${list.length === 1 ? "template" : "templates"}`,
                        <Pct rate={s.rate} sends={s.sends} tip={s.sends ? `${s.rate} % of ${s.sends} sent got a reply` : "Not sent yet"} />, g.color)}
                    </Fragment>
                  );
                })}
              </div>
            ) : null}
            {archived.length ? (
              <div className="wt-sec">{item(view === "archived" && !tag, () => pickView("archived"), "Archived", `${archived.length} kept for their numbers`, null)}</div>
            ) : null}
            <div className="wt-sec">{item(view === "older", () => pickView("older"), "Older templates", `${olderCount} from before the campaign`, null)}</div>
          </div>
        </aside>
        <section className="wt-main" aria-label={title}>{main}</section>
      </div>
      {undo ? (
        <div className="wt-undo" role="status">
          Archived. Its numbers stay in Analytics.
          <button type="button" onClick={() => { const t = undo; setUndo(null); void bringBack(t); }}>Undo</button>
        </div>
      ) : null}
    </div>
  );
}
