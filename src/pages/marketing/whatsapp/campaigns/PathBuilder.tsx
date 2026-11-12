/**
 * A campaign's path (owner, 11 Nov 2026; board AdminWaCampaigns, "Live campaign · the path"): the step-by-step
 * builder, like a HighLevel workflow in the Templates look. The Intro path runs down the middle; under REPLY PATHS a
 * YES, Not now or STOP reply opens its own lane. + between two steps adds one; a click opens the step panel. Every
 * change is saved as you go (PUT /campaigns/<id>/path/) once the path is complete.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../../../../components/ConfirmDialog";
import { ErrorState, LoadingState } from "../../../../components/States";
import { useToast } from "../../../../components/Toast";
import { ApiError } from "../../../../lib/api";
import type { Audience } from "../../../../lib/marketingApi";
import {
  createWaPathCampaign, deleteWaCampaign, getWaPath, getWaSchedule, putWaPath, saveWaCampaign, waCampaignAction,
  type WaCampaign, type WaContact, type WaLane, type WaPath, type WaPathInfo, type WaPathStep, type WaPreset,
  type WaScheduleRow, type WaStepKind, type WaStepStats, type WaTemplate,
} from "../../../../lib/whatsappApi";
import { CATEGORY_LABEL, errText } from "../shared";
import { isDraft, previewOf, SAMPLES, type Cat, type PreviewContact } from "../templateModel";
import { Svg } from "../templateParts";
import { ContactPicker } from "./ContactPicker";
import {
  ADDS, blankStep, checkPath, dayLabels, draftSteps, GOAL_LABEL, IC, issueOf, LANE_NAME, LANES, normalisePath, pathDays,
  REPLY_COLS, statusOf, STATUS_LABEL, unitWord, type DayLabel, type PathIssue,
} from "./pathModel";
import { loadPresets } from "./usePathApi";
import { StepPanel, textFor, type Sel } from "./StepPanel";
import "../../../../styles/wa-templates.css";
import "../../../../styles/wa-campaigns.css";

const LANG_NAME: Record<string, string> = { en: "English", hi: "Hinglish first", ab: "Half English, half Hinglish" };
/** The ready paths' second line and toast (board presets). */
const PRESET_TEXT: Record<string, [string, string]> = {
  "100_reviews": ["30 Intro messages, one every 3 days, then the YES path to Paid and a review", "The 90-day path is in. Change any step, or remove what you don’t need."],
  short: ["Opener, Problem, Offer. For a small list or a quick test", "The short path is in. Change any step, or add more with +."],
  blank: ["Only the start. Add every step yourself with +", ""],
};
const ZOOMS = { min: 60, max: 120 };

const missingRoute = (err: unknown): boolean => err instanceof ApiError && (err.status === 404 || err.status === 405);
const countSteps = (p: WaPath): number => LANES.reduce((a, l) => a + p.lanes[l].length, 0);

function Icon({ d, size = 16 }: { d: string; size?: number }): ReactElement {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

/** What a step looks like on the board: a card, or a wait pill. */
interface NodeView {
  card: boolean;
  cls: string;
  k: string;
  title: string;
  sub?: string;
  day?: string;
  prev?: string;
  prevDraft?: boolean;
  cond?: string;
  foot?: string;
  here: number;
  icon: string;
}

function NodeBody({ v }: { v: NodeView }): ReactElement {
  const here = v.here > 0 ? <span className="wf-here" title={`${v.here} ${v.here === 1 ? "person is" : "people are"} at this step now`}><i />{v.here} here</span> : null;
  if (!v.card) {
    return <><span className="wf-ic"><Icon d={v.icon} size={14} /></span>{v.title}<small>{v.sub}</small>{here}</>;
  }
  return (
    <>
      <span className="wf-nh">
        <span className="wf-ic"><Icon d={v.icon} /></span>
        <span className="wf-nt"><span className="wf-k">{v.k}</span><b>{v.title}</b>{v.sub ? <span className="wf-nsub">{v.sub}</span> : null}</span>
        {v.day ? <span className="wf-day">{v.day}</span> : null}
      </span>
      {v.prev !== undefined ? <span className="wf-prev"><span className={v.prevDraft ? "is-draft" : undefined}>{v.prev}</span></span> : null}
      {v.cond ? <span className="wf-cond">{v.cond}</span> : null}
      {v.foot !== undefined ? <span className="wf-nf"><span>{v.foot}</span>{here}</span> : null}
    </>
  );
}

/** The + between two steps and its menu. */
function AddGap({ open, onToggle, onPick }: { open: boolean; onToggle: () => void; onPick: (k: WaStepKind) => void }): ReactElement {
  return (
    <div className="wf-gap">
      <span className="wf-line" />
      <button type="button" className="wf-plus" aria-label="Add a step here" title="Add a step here" aria-haspopup="menu" aria-expanded={open} onClick={onToggle}>+</button>
      <span className="wf-line" />
      {open ? (
        <div className="wf-add" role="menu" aria-label="Add a step">
          <span className="wf-addh">ADD A STEP HERE</span>
          {ADDS.map(([k, label, sub]) => (
            <button key={k} type="button" role="menuitem" onClick={() => onPick(k)}>
              <span className="wf-ic"><Icon d={IC[k]} size={15} /></span>
              <span>{label}<small>{sub}</small></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Closes a menu on a click outside `inside` or on Esc (the Templates menu pattern). */
function useAway(open: boolean, close: () => void, inside: string): void {
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.(inside)) close();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open, close, inside]);
}

/** The ready paths, as on the board's empty campaign. */
function Presets({ presets, busy, onPick }: { presets: WaPreset[]; busy: boolean; onPick: (p: WaPreset) => void }): ReactElement {
  return (
    <div className="wf-start">
      <h3>Build the path</h3>
      <p>Use + to add a step: a template, then a wait, then the next template. Or start from a ready path and change what you like.</p>
      {presets.map((p) => {
        const n = countSteps(normalisePath(p.path));
        return (
          <button key={p.key} type="button" className="wf-preset" disabled={busy} onClick={() => onPick(p)}>
            <span>{p.name}<small>{PRESET_TEXT[p.key]?.[0] ?? ""}</small></span>
            <span className="wt-pill">{n} {n === 1 ? "step" : "steps"}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The bar over the board: back, the name, its status and the actions. */
function Bar({ camp, name, onName, saved, readOnly, children, meta }: {
  camp: WaCampaign | null; name: string; onName: (v: string) => void; saved: string; readOnly: boolean; children: ReactElement; meta: string;
}): ReactElement {
  const st = camp ? statusOf(camp) : "draft";
  return (
    <div className="wf-bar">
      <div className="wf-tt">
        <div className="wf-crumb"><Link to="/marketing/whatsapp/campaigns">← All campaigns</Link><span>/</span><span>{camp ? `${STATUS_LABEL[st]} campaign` : "New campaign"}</span></div>
        <div className="wf-name">
          <input type="text" value={name} maxLength={120} aria-label="Campaign name" placeholder="Untitled campaign" disabled={readOnly} onChange={(e) => onName(e.target.value)} />
          <span className={`wf-st is-${st}`}><i />{STATUS_LABEL[st]}</span>
        </div>
        <span className="wf-meta">{meta}</span>
      </div>
      <div className="wf-acts">{saved ? <span className="wf-saved" role="status">{saved}</span> : null}{children}</div>
    </div>
  );
}

/** /campaigns/new on a server with paths: name it, pick a ready path, and the draft is made. */
export function NewPathCampaign({ base, onSaved }: { base: WaCampaign; onSaved: () => void }): ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [presets, setPresets] = useState<WaPreset[] | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void loadPresets().then(setPresets); }, []);
  const make = async (p: WaPreset) => {
    setBusy(true);
    try {
      // No daily limit or language: a new campaign takes them from Settings (new people a day, language).
      const { daily_limit: _limit, language: _lang, ...rest } = base;
      const made = await createWaPathCampaign({ ...rest, name: name.trim() || "Untitled campaign" } as WaCampaign, p.key);
      toast(p.key === "blank" ? "Draft campaign added. Use + to add the first step." : `Draft campaign added. ${PRESET_TEXT[p.key]?.[1] ?? ""}`);
      onSaved();
      navigate(`/marketing/whatsapp/campaigns/${made.id}`);
    } catch (err) {
      toast(errText(err, "Couldn't add the campaign."), "bad");
      setBusy(false);
    }
  };
  return (
    <div className="wf-wrap">
      <section className="wf-main" aria-label="New campaign">
        <Bar camp={null} name={name} onName={setName} saved="" readOnly={false} meta="Not started · nothing is sent until you start it"><span /></Bar>
        <div className="wf-board">
          <div className="wf-flow">
            <div className="wf-node is-start" role="group" aria-label="Start">
              <NodeBody v={{ card: true, cls: "", k: "START", title: "Contact is added to this campaign", sub: "Contacts you add to it · opted in", foot: "Nobody yet · starts when you start it", here: 0, icon: IC.start }} />
            </div>
            <span className="wf-line wf-line--tall" />
            {presets === undefined ? <LoadingState /> : presets ? <Presets presets={presets} busy={busy} onPick={(p) => void make(p)} /> : <ErrorState message="Couldn't load the ready paths." />}
          </div>
        </div>
      </section>
    </div>
  );
}

export function PathBuilder({ campaign, templates, audiences, contacts, onSaved, onNoPath }: {
  campaign: WaCampaign; templates: WaTemplate[]; audiences: Audience[]; contacts: WaContact[]; onSaved: () => void; onNoPath: () => void;
}): ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const id = campaign.id as number;
  const [load, setLoad] = useState<"loading" | "ready" | string>("loading");
  const [path, setPath] = useState<WaPath | null>(null);
  const [stats, setStats] = useState<Record<string, WaStepStats>>({});
  const [serverIssues, setServerIssues] = useState<PathIssue[]>([]);
  const [save, setSave] = useState<{ state: "saved" | "saving" | "invalid" | "error"; at?: number; msg?: string }>({ state: "saved" });
  const saved = useRef("");
  const pending = useRef<{ path: WaPath; json: string } | null>(null);
  const [camp, setCamp] = useState<WaCampaign>(campaign);
  const campTimer = useRef<number | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [addAt, setAddAt] = useState<{ lane: WaLane; id: string | null } | null>(null);
  const [zoom, setZoom] = useState(100);
  const [undo, setUndo] = useState<{ lane: WaLane; list: WaPathStep[] } | null>(null);
  const [confirm, setConfirm] = useState<"" | "start" | "pause" | "delete">("");
  const [picking, setPicking] = useState(() => window.location.hash === "#contacts");
  const [menu, setMenu] = useState(false);
  const [schedule, setSchedule] = useState<WaScheduleRow[] | null>(null);
  const [presets, setPresets] = useState<WaPreset[] | null>(null);

  const st = statusOf(camp);
  const readOnly = st === "ended";
  const mine = useMemo(() => contacts.filter((c) => c.campaign === id), [contacts, id]);
  const sample = mine[0] ?? contacts.find((c) => c.status !== "stop") ?? null;
  const who: PreviewContact = sample ? previewOf(sample) : SAMPLES[0];
  const campLang: "en" | "hi" = camp.language === "hi" ? "hi" : "en";
  const byId = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  const refreshSchedule = useCallback(() => {
    getWaSchedule(id, sample?.id).then((r) => setSchedule(Array.isArray(r) ? r : null)).catch(() => setSchedule(null));
  }, [id, sample?.id]);

  useEffect(() => {
    let alive = true;
    getWaPath(id).then((r: WaPathInfo) => {
      if (!alive) return;
      if (r.engine && r.engine !== "path") { onNoPath(); return; }
      const p = normalisePath(r.path);
      saved.current = JSON.stringify(p);
      setPath(p);
      setStats(r.stats ?? {});
      setServerIssues((r.issues ?? []).map(issueOf));
      setLoad("ready");
    }).catch((err) => {
      if (!alive) return;
      if (missingRoute(err)) onNoPath();
      else setLoad(errText(err, "Couldn't load the path."));
    });
    void loadPresets().then((x) => { if (alive) setPresets(x); });
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(refreshSchedule, [refreshSchedule]);

  const issues = useMemo(() => (path ? checkPath(path, templates) : []), [path, templates]);
  const json = path ? JSON.stringify(path) : "";
  const dirty = !!path && json !== saved.current;

  const doSave = useCallback(async (p: WaPath, j: string) => {
    pending.current = null;
    setSave({ state: "saving" });
    try {
      const r = await putWaPath(id, p);
      saved.current = j;
      setSave({ state: "saved", at: Date.now() });
      if (r && r.stats) setStats(r.stats);
      setServerIssues((r?.issues ?? []).map(issueOf));
      if (r?.moved) toast(`${r.moved} ${r.moved === 1 ? "person was" : "people were"} at a removed step and moved on to the next one.`);
      refreshSchedule();
    } catch (err) {
      setSave({ state: "error", msg: errText(err, "Couldn't save the path.") });
      if (err instanceof ApiError && Object.keys(err.fields).length) setServerIssues(Object.values(err.fields).map((text) => ({ text })));
    }
  }, [id, toast, refreshSchedule]);

  // Saved as you go: a complete path saves 0.7 s after the last change.
  useEffect(() => {
    if (!path || readOnly || json === saved.current) return;
    if (issues.length) { pending.current = null; setSave({ state: "invalid" }); return; }
    pending.current = { path, json };
    setSave({ state: "saving" });
    const timer = window.setTimeout(() => void doSave(path, json), 700);
    return () => window.clearTimeout(timer);
  }, [json, issues.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the page with a save still waiting: send it.
  useEffect(() => () => {
    const p = pending.current;
    if (p) void putWaPath(id, p.path).catch(() => undefined);
    if (campTimer.current) window.clearTimeout(campTimer.current);
  }, [id]);
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undo]);
  const closeAdd = useCallback(() => setAddAt(null), []);
  const closeMenu = useCallback(() => setMenu(false), []);
  useAway(!!addAt, closeAdd, ".wf-gap");
  useAway(menu, closeMenu, ".wf-more");

  /** Name, audience, language, daily limit: PATCHed 0.7 s after the last change. */
  const onCamp = (patch: Partial<WaCampaign>) => {
    const next = { ...camp, ...patch };
    setCamp(next);
    if (campTimer.current) window.clearTimeout(campTimer.current);
    campTimer.current = window.setTimeout(() => {
      campTimer.current = null;
      if (!next.name.trim()) return;
      const body = { id, name: next.name.trim(), audience: next.audience, language: next.language, daily_limit: next.daily_limit } as WaCampaign;
      saveWaCampaign(body).then(() => onSaved()).catch((err) => toast(errText(err, "Couldn't save the campaign."), "bad"));
    }, 700);
  };

  if (load !== "ready" || !path) return load === "loading" ? <LoadingState /> : <ErrorState message={load} />;

  const labels = Object.fromEntries(LANES.map((l) => [l, dayLabels(l, path.lanes[l])])) as Record<WaLane, Record<string, DayLabel>>;
  const days = pathDays(path);
  const setLane = (lane: WaLane, list: WaPathStep[]) => setPath((p) => (p ? { ...p, lanes: { ...p.lanes, [lane]: list } } : p));
  const onStep = (lane: WaLane, sid: string, patch: Partial<WaPathStep>) => setLane(lane, path.lanes[lane].map((x) => (x.id === sid ? { ...x, ...patch } : x)));
  const insert = (lane: WaLane, after: string | null, k: WaStepKind) => {
    const list = path.lanes[lane];
    const ns = blankStep(path, lane, k);
    const i = after ? list.findIndex((x) => x.id === after) : -1;
    setLane(lane, [...list.slice(0, i + 1), ns, ...list.slice(i + 1)]);
    setAddAt(null);
    setSel({ lane, id: ns.id });
  };
  const remove = () => {
    if (!sel || sel.lane === "listen") return;
    const prev = path.lanes[sel.lane];
    setLane(sel.lane, prev.filter((x) => x.id !== sel.id));
    setUndo({ lane: sel.lane, list: prev });
    setSel(null);
  };
  const usePreset = (p: WaPreset) => {
    setPath(normalisePath(p.path));
    setSel(null);
    if (p.key === "blank") setAddAt({ lane: "main", id: path.lanes.main[0].id });
    else toast(PRESET_TEXT[p.key]?.[1] ?? "The path is in.");
  };
  const pick = (lane: WaLane, sid: string) => { setSel({ lane, id: sid }); setAddAt(null); };

  // ---- what each step shows ----
  const view = (lane: WaLane, s: WaPathStep): NodeView => {
    const lab = labels[lane][s.id];
    const x = stats[s.id];
    const here = x?.here ?? 0;
    const v: NodeView = { card: s.k !== "wait" && s.k !== "reply", cls: "wf-node", k: "", title: "", here, icon: IC[s.k] ?? IC.send };
    switch (s.k) {
      case "start": {
        const n = camp.contacts ?? camp.stats?.contacts ?? mine.length;
        return { ...v, cls: "wf-node is-start", k: "START", title: "Contact is added to this campaign", sub: `${camp.audience_name || "Contacts you add to it"} · opted in`, foot: n ? `${n} entered` : `Nobody yet · starts ${st === "draft" ? "when you start it" : "as you add them"}`, here: 0 };
      }
      case "send": {
        const t = s.template ? byId.get(s.template) : undefined;
        const draft = !t || isDraft(t);
        const cat = t?.category ? CATEGORY_LABEL[t.category as Cat].toUpperCase() : t ? "OLDER" : "";
        return {
          ...v, cls: "wf-node" + (t ? "" : " is-empty"), k: `SEND${cat ? ` · ${cat}` : ""}`, title: t ? t.type_name || t.name : "Pick a template", sub: t && t.type_name ? t.name : undefined,
          day: lab?.day, prev: !t ? "Click to pick a template from any category." : draft ? "Draft: not written yet. Write it in Templates; contacts wait here until then." : textFor(t, who, campLang).text,
          prevDraft: draft, cond: s.only_if === "no_pc" ? "Only if no PC yet" : undefined,
          foot: x && (x.sent > 0 || here > 0) ? (x.sent ? `${x.sent} sent · ${x.reply_rate} % replied` : "Not sent yet") : undefined,
        };
      }
      case "wait": {
        const n = s.n ?? 0;
        return { ...v, title: `Wait ${n} ${unitWord(n, s.unit)}`, sub: s.window ? "Mon–Sat, 10:00–19:00" : "any day, any time" };
      }
      case "reply": {
        const n = s.n ?? 0;
        return { ...v, title: "Wait for their answer", sub: `up to ${n} ${unitWord(n, s.unit)}` };
      }
      case "track":
        return { ...v, k: "ACTION", title: "Set the Track", sub: "You set it on Today after their answers", day: lab?.day };
      case "group": {
        const intro = s.category !== "demo_video";
        const count = s.count ?? 0;
        const every = s.every ?? 1;
        return {
          ...v, cls: "wf-node is-group", k: `SEND · ${intro ? "INTRO" : "DEMO VIDEO"} · ${count} MESSAGES`, title: `${count} more ${intro ? "Intro messages" : "Demo videos"}`,
          sub: `One every ${every === 1 ? "day" : `${every} days`}${intro ? ", in day order from Templates" : ", on the contact’s Track"}`, day: lab?.day,
          foot: x?.sent ? `${x.sent} sent · ${x.reply_rate} % replied` : "Click to see the list",
          cond: lane === "main" && lab?.last && lab.last > 90 ? `Runs to day ${lab.last}, past day 90: shorten a wait` : undefined,
        };
      }
      case "goal":
        return { ...v, cls: "wf-node is-goal", k: "GOAL", title: GOAL_LABEL[s.goal ?? "paid"], sub: "They wait here until it happens, then go on", day: lab?.day, foot: x?.sent ? `${x.sent} reached it` : undefined, here: 0 };
      case "goto": {
        const target = s.step === "resume" ? "Back to the Intro messages" : s.lane === "yes" && path.lanes.yes[0]?.id === s.step ? "The start of the YES path" : `${LANE_NAME[s.lane ?? "main"]}, step ${(path.lanes[s.lane ?? "main"].findIndex((y) => y.id === s.step) + 1) || "?"}`;
        return { ...v, k: "GO TO", title: target, sub: s.step === "resume" ? "At the next one they haven’t had" : undefined };
      }
      default:
        return { ...v, cls: "wf-node is-end", k: "END", title: s.label || "Ends here" };
    }
  };

  const isOn = (lane: WaLane, sid: string) => !!sel && sel.lane === lane && sel.id === sid;
  const step = (lane: WaLane, s: WaPathStep) => {
    const v = view(lane, s);
    const canAdd = !readOnly && s.k !== "end" && s.k !== "goto";
    const open = !!addAt && addAt.lane === lane && addAt.id === s.id;
    return (
      <Fragment key={s.id}>
        <button type="button" className={v.card ? v.cls : "wf-wait"} aria-pressed={isOn(lane, s.id)} data-step={s.id} onClick={() => pick(lane, s.id)}>
          <NodeBody v={v} />
        </button>
        {canAdd ? <AddGap open={open} onToggle={() => { setAddAt(open ? null : { lane, id: s.id }); setSel(null); }} onPick={(k) => insert(lane, s.id, k)} />
          : s.k !== "end" && s.k !== "goto" ? <span className="wf-line wf-line--tall" /> : null}
      </Fragment>
    );
  };
  const emptyLane = (lane: WaLane) => {
    const open = !!addAt && addAt.lane === lane && addAt.id === null;
    return (
      <>
        <button type="button" className="wf-node is-empty" onClick={() => { setAddAt({ lane, id: null }); setSel(null); }} disabled={readOnly}>
          <NodeBody v={{ card: true, cls: "", k: "NO STEPS YET", title: "Use + below to add the first step", here: 0, icon: IC.empty }} />
        </button>
        {readOnly ? null : <AddGap open={open} onToggle={() => setAddAt(open ? null : { lane, id: null })} onPick={(k) => insert(lane, null, k)} />}
      </>
    );
  };

  // ---- the bar ----
  const n = camp.stats;
  const contactsIn = camp.contacts ?? n?.contacts ?? mine.length;
  const yes = camp.yes ?? n?.interested ?? 0;
  const paid = camp.paid ?? 0;
  const sent = camp.sent ?? n?.messaged ?? 0;
  const replies = camp.replies ?? n?.replied ?? 0;
  const rate = typeof camp.reply_rate === "number" ? camp.reply_rate : sent ? Math.round((replies / sent) * 100) : 0;
  const hereIn = (lane: WaLane) => path.lanes[lane].reduce((a, s) => a + (stats[s.id]?.here ?? 0), 0);
  const entered = (lane: WaLane) => path.lanes[lane].reduce((a, s) => Math.max(a, stats[s.id]?.sent ?? 0), 0) || hereIn(lane);
  const barStats: [number | string, string][] = contactsIn ? [
    [contactsIn, "in the campaign ·"], [hereIn("main"), "on Intro ·"], [yes, "said YES ·"], [entered("notnow"), "not now ·"],
    [n?.stopped ?? entered("stop"), "stopped ·"], [paid, "paid ·"], [sent ? `${rate} %` : "—", "replied"],
  ] : [];
  const drafts = draftSteps(path, templates);
  const meta = [camp.audience_name || "Contacts you add to it", LANG_NAME[camp.language ?? "en"], "Mon–Sat, 10:00–19:00", days ? `${days} days` : "", camp.day && st !== "draft" ? `day ${camp.day}` : ""].filter(Boolean).join(" · ");
  const savedL = readOnly ? "Read only" : save.state === "saving" ? "Saving…" : save.state === "invalid" ? `Not saved yet: ${issues.length} to fix` : save.state === "error" ? "Not saved" : save.at ? "Saved · just now" : "All changes saved";
  const act = () => {
    if (st === "live") { setConfirm("pause"); return; }
    if (issues.length) { toast(`Fix ${issues.length === 1 ? "one thing" : `${issues.length} things`} on the path first: ${issues[0].text}`, "bad"); return; }
    if (dirty) { toast("Saving your last change. Try again in a moment.", "bad"); return; }
    setConfirm("start");
  };
  const firstSend = path.lanes.main.find((s) => s.k === "send" && s.template && byId.get(s.template) && !isDraft(byId.get(s.template) as WaTemplate));
  const firstT = firstSend?.template ? byId.get(firstSend.template) : undefined;
  const testText = firstT ? textFor(firstT, who, campLang).text : "";
  const isEmpty = path.lanes.main.length === 1 && st === "draft";
  const hasReplies = !isEmpty || REPLY_COLS.some(([l]) => path.lanes[l].length);
  // The path's own checks first (a loaded path can need work too), else what the server said.
  const shownIssues = save.state !== "error" && issues.length ? issues : serverIssues;
  const repliesSorted = replies || yes;

  return (
    <div className="wf-wrap">
      <section className="wf-main" aria-label={camp.name}>
        <Bar camp={camp} name={camp.name} onName={(v) => onCamp({ name: v })} saved={savedL} readOnly={readOnly} meta={meta}>
          <>
            {testText ? (
              <a className="wt-btn" href={`https://wa.me/?text=${encodeURIComponent(testText)}`} target="_blank" rel="noopener noreferrer" title={`Opens WhatsApp with the first message as ${who.short} gets it. Send it to yourself.`}>
                <Svg d="M22 2 11 13M22 2 15 22l-4-9-9-4z" size={16} />Test on my WhatsApp
              </a>
            ) : null}
            {readOnly ? <span className="wt-btn" aria-disabled="true">Ended</span> : (
              <button type="button" className={st === "live" ? "wt-btn" : "wt-btn is-dark"} onClick={act}>{st === "live" ? "Pause" : st === "paused" ? "Resume" : "Start campaign"}</button>
            )}
            <div className="wf-more">
              <button type="button" className="wc-icon" aria-label="More actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
              </button>
              {menu ? (
                <div className="wc-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setSel({ lane: "main", id: path.lanes.main[0].id }); }}>Who enters and pace</button>
                  {readOnly ? null : <button type="button" role="menuitem" onClick={() => { setMenu(false); setPicking(true); }}>Add contacts</button>}
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); navigate("/marketing/whatsapp"); }}>Open Today</button>
                  {st === "draft" ? <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenu(false); setConfirm("delete"); }}>Delete draft</button> : null}
                </div>
              ) : null}
            </div>
          </>
        </Bar>
        {barStats.length ? (
          <div className="wt-stats">
            {barStats.map(([v, l]) => <span key={l}><b>{v}</b> {l}</span>)}
            <span className="wf-livenote">{st === "live" ? "Live: a change applies to people who haven’t reached that step" : st === "paused" ? "Paused: nobody gets a message" : st === "ended" ? "Ended: read only" : ""}</span>
          </div>
        ) : null}
        {!isEmpty && shownIssues.length ? (
          <div className="wf-issues" role="alert">
            <b>{save.state === "error" ? `Not saved: ${save.msg ?? ""}` : dirty ? "Not saved yet. Fix these and it saves by itself:" : "This path needs a look before it can run:"}</b>
            <ul>
              {shownIssues.slice(0, 4).map((x, i) => (
                <li key={i}>{x.step && x.lane ? <button type="button" onClick={() => pick(x.lane as WaLane, x.step as string)}>{x.text}</button> : x.text}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="wf-board">
          <div className="wf-zoom" aria-label="Zoom">
            <button type="button" aria-label="Zoom out" disabled={zoom <= ZOOMS.min} onClick={() => setZoom((z) => Math.max(ZOOMS.min, z - 10))}>−</button>
            <span>{zoom} %</span>
            <button type="button" aria-label="Zoom in" disabled={zoom >= ZOOMS.max} onClick={() => setZoom((z) => Math.min(ZOOMS.max, z + 10))}>+</button>
          </div>
          <div className="wf-legend"><span><i />people at this step now</span><span>Click a step to change it · + adds one</span></div>
          <div className="wf-flow" style={zoom === 100 ? undefined : { zoom: zoom / 100 }}>
            {path.lanes.main.map((s) => step("main", s))}
            {isEmpty && presets ? <Presets presets={presets} busy={false} onPick={usePreset} /> : null}
            {hasReplies ? (
              <>
                <div className="wf-sep">REPLY PATHS</div>
                <button type="button" className="wf-node is-start" aria-pressed={!!sel && sel.lane === "listen"} onClick={() => { setSel({ lane: "listen", id: "listen" }); setAddAt(null); }}>
                  <NodeBody v={{ card: true, cls: "", k: "WHEN THEY REPLY", title: "Any time during this campaign", sub: "Claude reads the reply and suggests the path. You confirm it on Today.", foot: repliesSorted ? `${repliesSorted} replies sorted so far` : "Every reply shows on Today first", here: 0, icon: IC.listen }} />
                </button>
                <div className="wf-fan">
                  <span className="wf-line" />
                  <div className="wf-split" />
                  <div className="wf-cols">
                    {REPLY_COLS.map(([lane, label]) => {
                      const c = lane === "yes" ? yes : entered(lane);
                      return (
                        <div key={lane} className="wf-col" aria-label={label}>
                          <span className="wf-line" />
                          <span className="wf-colh">{label}{contactsIn ? <span> · {c}</span> : null}</span>
                          <span className="wf-line" />
                          {path.lanes[lane].length ? path.lanes[lane].map((s) => step(lane, s)) : emptyLane(lane)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>
      {sel ? (
        <StepPanel key={`${sel.lane}:${sel.id}`} sel={sel} path={path} camp={camp} templates={templates} audiences={audiences} who={who} campLang={campLang}
          stats={stats} labels={labels} schedule={schedule} dirty={dirty} readOnly={readOnly} contactsIn={contactsIn} repliesSorted={repliesSorted}
          onStep={onStep} onLane={(lane, list, msg) => { setLane(lane, list); setSel(null); if (msg) toast(msg); }} onRemove={remove} onCamp={onCamp}
          onAddContacts={() => setPicking(true)} onClose={() => setSel(null)} />
      ) : null}
      {undo ? (
        <div className="wt-undo" role="status">
          Step removed.
          <button type="button" onClick={() => { setLane(undo.lane, undo.list); setUndo(null); }}>Undo</button>
        </div>
      ) : null}
      {picking ? <ContactPicker campaign={camp} contacts={contacts} onClose={() => { setPicking(false); if (window.location.hash === "#contacts") history.replaceState(null, "", window.location.pathname); }} onAdded={onSaved} /> : null}
      {confirm ? (
        <ConfirmDialog
          title={confirm === "start" ? (st === "paused" ? "Resume this campaign?" : "Start this campaign?") : confirm === "pause" ? "Pause this campaign?" : "Delete this draft?"}
          confirmLabel={confirm === "start" ? (st === "paused" ? "Resume" : "Start campaign") : confirm === "pause" ? "Pause" : "Delete"}
          danger={confirm === "delete"}
          onClose={() => setConfirm("")}
          onConfirm={async () => {
            if (confirm === "delete") { await deleteWaCampaign(id); onSaved(); navigate("/marketing/whatsapp/campaigns"); return; }
            const next = await waCampaignAction(id, confirm);
            setCamp((c) => ({ ...c, ...next }));
            onSaved();
            toast(confirm === "pause" ? "Paused. Nobody gets a message until you resume. Replies still show on Today." : st === "paused" ? "Live again. Everyone goes on from the step they were at." : "Started. The first messages appear in Today for you to send.");
          }}
        >
          {confirm === "start" ? `Nothing is sent automatically. Each day’s messages appear in Today for you to send yourself.${drafts ? ` ${drafts} ${drafts === 1 ? "step uses a draft template" : "steps use draft templates"}: a draft is never sent, and contacts wait at it until you write it in Templates.` : ""}` : confirm === "pause" ? "Replies still appear in Today. No new messages from this path will." : "The campaign is removed. Its contacts stay in Contacts."}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

