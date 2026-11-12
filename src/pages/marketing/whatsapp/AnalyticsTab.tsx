/**
 * Marketing -> WhatsApp -> Analytics (wa4, 12 Nov 2026), as the approved board: the menu picks a campaign (or all), the
 * Overview or one split (step of the path, template, segment, language, send slot, coupon code); the Period select
 * scopes everything. Five KPI tiles on top; the Overview adds the funnel (people, not messages) and the messages sent
 * each day; each split is one table with a one-line takeaway (analyticsTakes.ts). Numbers: GET /analytics/view/.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { WaAnalytics, WaCampaign, WaTemplate } from "../../../lib/whatsappApi";
import type { WaCampaignX } from "../../../lib/whatsappApi.tabs";
import { getWaView, PERIOD_LABEL, type WaPeriod, type WaView, type WaViewStep } from "../../../lib/whatsappApi.analytics";
import { CATEGORY_LABEL, Count, errText, LANG_LABEL, RateChip, SideItem, WtShell } from "./shared";
import { codeTake, funnelTake, judgedSteps, languageTake, pctText, rate, segmentTake, slotTake, stepDays, stepName, stepTake, templateTake } from "./analyticsTakes";
import "../../../styles/wa-analytics.css";

type Split = "overview" | "step" | "template" | "segment" | "language" | "slot" | "code";
const SPLITS: { key: Exclude<Split, "overview">; label: string; sub: string }[] = [
  { key: "step", label: "Step of the path", sub: "Where people drop" },
  { key: "template", label: "Template", sub: "Best and weakest" },
  { key: "segment", label: "Segment", sub: "Who they are" },
  { key: "language", label: "Language", sub: "English vs Hinglish" },
  { key: "slot", label: "Send slot", sub: "When they reply" },
  { key: "code", label: "Coupon code", sub: "Offers that worked" },
];
const STATUS: Record<string, [string, string]> = {
  live: ["Live", "var(--ok)"], paused: ["Paused", "var(--accent)"], draft: ["Draft", "var(--ink-4)"],
};
const LANE_PATH: Record<string, string> = { yes: "YES path", notnow: "Not now path", stop: "STOP path" };
/** A main lane longer than this folds its later messages into one row (Show all opens it). */
const FOLD_AFTER = 4;
const FOLD_MIN = 7;

const W = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayOf = (iso: string): Date => new Date(`${iso}T12:00:00`);
const dayText = (iso: string): string => {
  const d = dayOf(iso);
  return `${W[d.getDay()]} ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
};
const waitText = (secs: number | null): string => {
  if (secs === null) return "—";
  const m = Math.round(secs / 60);
  if (m < 60) return `${Math.max(1, m)} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
};

// --- Hover tooltips: one per page, fixed to the pointer (or the focused mark) ---------------------------------------

interface TipState { text: string; x: number; y: number }
function useTip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const on = useCallback((text: string) => ({
    onPointerMove: (e: PointerEvent<HTMLElement>) => setTip({ text, x: e.clientX, y: e.clientY }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: { currentTarget: HTMLElement }) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ text, x: r.left + r.width / 2, y: r.top });
    },
    onBlur: () => setTip(null),
  }), []);
  const node = tip ? <div className="wan-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null;
  return { on, node, setTip };
}
type TipOn = ReturnType<typeof useTip>["on"];

// --- Parts -----------------------------------------------------------------------------------------------------------

function Card({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }): ReactElement {
  return (
    <section className="wan-card">
      <div className="wan-cardh"><h3>{title}</h3>{note ? <span>{note}</span> : null}</div>
      {children}
    </section>
  );
}

function Kpis({ v }: { v: WaView }): ReactElement {
  const k = v.kpis;
  const stopRate = rate(k.stopped, k.people);
  const tiles: [string, string, ReactNode][] = [
    ["People messaged", String(k.people), `${k.messages} ${k.messages === 1 ? "message" : "messages"}`],
    ["Replied", pctText(k.replied, k.people), `${k.replied} ${k.replied === 1 ? "person" : "people"}`],
    ["Said YES", pctText(k.yes, k.people), `${k.yes} ${k.yes === 1 ? "person" : "people"}`],
    ["Paid", String(k.paid), `${k.paid_pcs ? `${k.paid_pcs} PCs · ` : ""}from ${k.yes} YES`],
    ["Asked to stop", pctText(k.stopped, k.people),
      <>{k.stopped} {k.stopped === 1 ? "person" : "people"} · <span className={stopRate > 2 ? "wan-over" : ""}>keep under 2 %</span></>],
  ];
  return (
    <div className="wan-kpis">
      {tiles.map(([l, val, sub]) => (
        <div key={l} className="wan-kpi"><span>{l}</span><b>{val}</b><small>{sub}</small></div>
      ))}
    </div>
  );
}

function Funnel({ v, tipOn, periodL }: { v: WaView; tipOn: TipOn; periodL: string }): ReactElement {
  const top = v.funnel[0]?.people ?? 0;
  return (
    <Card title="From first message to paid" note={`People, not messages · ${periodL}`}>
      <div className="wan-fun" role="list" aria-label="From first message to paid">
        {v.funnel.map((f, i) => {
          const prev = i ? v.funnel[i - 1] : null;
          const tip = `${f.label}: ${f.people} of ${top}${prev ? ` (${pctText(f.people, prev.people)} of ${prev.label.toLowerCase()})` : ""}`;
          return (
            <div key={f.key} className="wan-fr" role="listitem">
              <span>{f.label}</span>
              <div className="wan-ftrack">
                <div className="wan-fbar" tabIndex={0} aria-label={tip} style={{ width: `${top ? Math.max(0.5, (f.people / top) * 100) : 0}%` }} {...tipOn(tip)} />
              </div>
              <span><b>{f.people}</b> · {i ? pctText(f.people, top) : top ? "100 %" : "—"}</span>
            </div>
          );
        })}
      </div>
      <div className="wan-take">{funnelTake(v.funnel)}</div>
    </Card>
  );
}

/** Messages sent each day: one series (sent); the replies show on hover and in the table view. */
function Days({ v, setTip }: { v: WaView; setTip: (t: TipState | null) => void }): ReactElement {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const days = v.days;
  const max = Math.max(1, ...days.map((d) => d.sent));
  const text = (i: number): string => {
    const d = days[i];
    const sun = dayOf(d.date).getDay() === 0;
    return sun && !d.sent ? `${dayText(d.date)}: Sunday, nothing sent` : `${dayText(d.date)}: ${d.sent} sent, ${d.replies} ${d.replies === 1 ? "reply" : "replies"}`;
  };
  const show = (i: number | null, x?: number, y?: number) => {
    setActive(i);
    if (i === null) return setTip(null);
    const r = (box.current?.children[i]?.firstElementChild as HTMLElement | null | undefined)?.getBoundingClientRect();
    setTip({ text: text(i), x: x ?? (r ? r.left + r.width / 2 : 0), y: y ?? (r ? r.top : 0) });
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = active === null ? days.length - 1 : Math.min(days.length - 1, Math.max(0, active + (e.key === "ArrowRight" ? 1 : -1)));
    show(n);
  };
  const mid = days[Math.floor((days.length - 1) / 2)];
  return (
    <Card title="Messages sent each day" note="Hover a day for its replies · Sundays nothing goes">
      <div className="wan-dwrap">
        <span className="wan-dmax">{max} a day</span>
        <div ref={box} className="wan-days" tabIndex={0} role="group" aria-label={`Messages sent each day, last ${days.length} days. Use the arrow keys to read each day.`}
          onKeyDown={key} onBlur={() => show(null)} onPointerLeave={() => show(null)}>
          {days.map((d, i) => {
            const sun = dayOf(d.date).getDay() === 0;
            return (
              <span key={d.date} className={"wan-day" + (active === i ? " is-on" : "")} onPointerMove={(e) => show(i, e.clientX, e.clientY)}>
                <i className={sun && !d.sent ? "is-sun" : d.sent ? "" : "is-zero"} style={{ height: d.sent ? `${(d.sent / max) * 100}%` : undefined }} />
              </span>
            );
          })}
        </div>
        <span className="sr" aria-live="polite">{active === null ? "" : text(active)}</span>
      </div>
      <div className="wan-axis"><span>{dayText(days[0].date)}</span><span>{dayText(mid.date)}</span><span>{dayText(days[days.length - 1].date)} · today</span></div>
      <div className="wan-row">
        <button type="button" className="wt-btn is-ghost" aria-expanded={table} onClick={() => setTable((t) => !t)}>{table ? "Hide the table" : "Show as a table"}</button>
      </div>
      {table ? (
        <div className="wan-scroll">
          <table className="wan-bt is-plain">
            <thead><tr><th scope="col">DAY</th><th scope="col" className="num">SENT</th><th scope="col" className="num">REPLIES</th></tr></thead>
            <tbody>{[...days].reverse().map((d) => <tr key={d.date}><td>{dayText(d.date)}</td><td className="num">{d.sent}</td><td className="num">{d.replies}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

// --- The split tables ------------------------------------------------------------------------------------------------

interface Cell { part: number; whole: number; text?: string }
interface Row { key: string; name: string; sub: string; n: number; rep: Cell; next: Cell; last: string; fold?: boolean }
interface Table { title: string; note: string; h: [string, string, string, string, string]; rows: Row[]; take: string; empty: string; tail?: ReactNode }

function Bar({ c, dark, tipOn, tip }: { c: Cell; dark?: boolean; tipOn: TipOn; tip: string }): ReactElement {
  const w = c.whole ? Math.min(100, rate(c.part, c.whole)) : 0;
  return (
    <div className="wan-ib" {...(c.whole ? tipOn(tip) : {})}>
      <div><i className={dark ? "" : "is-2"} style={{ width: `${w}%` }} /></div>
      <span>{c.text ?? pctText(c.part, c.whole)}</span>
    </div>
  );
}

function SplitTable({ t, tipOn }: { t: Table; tipOn: TipOn }): ReactElement {
  return (
    <Card title={t.title} note={t.note}>
      {t.rows.length ? (
        <div className="wan-scroll">
          <table className="wan-bt">
            <caption className="sr">{t.title}</caption>
            <thead><tr><th scope="col">{t.h[0]}</th><th scope="col" className="num">{t.h[1]}</th><th scope="col">{t.h[2]}</th><th scope="col">{t.h[3]}</th><th scope="col" className="num">{t.h[4]}</th></tr></thead>
            <tbody>
              {t.rows.map((r) => (
                <tr key={r.key} className={r.fold ? "is-fold" : ""}>
                  <th scope="row"><b>{r.name}</b>{r.sub ? <small>{r.sub}</small> : null}</th>
                  <td className="num">{r.n}</td>
                  <td><Bar c={r.rep} dark tipOn={tipOn} tip={`${r.name}: ${r.rep.part} of ${r.rep.whole} replied`} /></td>
                  <td><Bar c={r.next} tipOn={tipOn} tip={`${r.name} · ${t.h[3].toLowerCase()}: ${r.next.part} of ${r.next.whole}`} /></td>
                  <td className="num">{r.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <span className="wan-empty">{t.empty}</span>}
      {t.tail}
      {t.rows.length ? <div className="wan-take">{t.take}</div> : null}
    </Card>
  );
}

function stepRows(steps: WaViewStep[], all: boolean): Row[] {
  const row = (s: WaViewStep, sub: string): Row => ({
    key: s.step_id, name: stepName(s), sub, n: s.sent, rep: { part: s.replies, whole: s.sent }, next: { part: s.went_on, whole: s.sent }, last: String(s.here),
  });
  const main = steps.filter((s) => s.lane === "main");
  const rest = steps.filter((s) => s.lane !== "main");
  const judged = judgedSteps(steps).filter((s) => s.sent >= 5);
  const weakest = (judged.length >= 3 ? judged : []).reduce<WaViewStep | null>((a, b) => (!a || b.reply_rate < a.reply_rate ? b : a), null);
  const sub = (s: WaViewStep) => [s.lane === "main" ? stepDays(s) : LANE_PATH[s.lane] ?? s.lane, s === weakest ? "weak" : ""].filter(Boolean).join(" · ");
  const out: Row[] = [];
  const fold = !all && main.length >= FOLD_MIN;
  (fold ? main.slice(0, FOLD_AFTER) : main).forEach((s) => out.push(row(s, sub(s))));
  if (fold) {
    const later = main.slice(FOLD_AFTER);
    const sum = (f: (s: WaViewStep) => number) => later.reduce((n, s) => n + f(s), 0);
    const sent = sum((s) => s.sent);
    const first = stepDays(later[0]).replace(/^Days? /, "").split("–")[0];
    const last = stepDays(later[later.length - 1]).replace(/^Days? /, "").split("–").pop();
    out.push({
      key: "fold", fold: true, name: `${later.length} more Intro steps`, sub: first && last ? `Days ${first}–${last}` : "", n: sent,
      rep: { part: sum((s) => s.replies), whole: sent }, next: { part: sum((s) => s.went_on), whole: sent }, last: String(sum((s) => s.here)),
    });
  }
  rest.forEach((s) => out.push(row(s, sub(s))));
  return out;
}

const langOf = (l: string[]): string => (l.length > 1 ? "Both" : l[0] ? LANG_LABEL[l[0] as keyof typeof LANG_LABEL] ?? l[0] : "—");
const codeSub = (c: WaView["codes"][number]): string => {
  const when = c.status === "scheduled" ? `from ${new Date(`${c.starts_on}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
    : c.status === "live" ? "" : c.status;
  return [c.pack || (c.event ? "Festival" : ""), `${c.percent_off} %`, c.stage ? `stage ${c.stage}` : "", when].filter(Boolean).join(" · ");
};

function tableFor(split: Exclude<Split, "overview">, v: WaView, showAll: boolean, setShowAll: (b: boolean) => void): Table {
  if (split === "step") {
    const steps = v.steps ?? [];
    const rows = stepRows(steps, showAll);
    const folded = rows.some((r) => r.fold);
    const canFold = steps.filter((s) => s.lane === "main").length >= FOLD_MIN;
    return {
      title: "By step of the path", note: "Each step as built in Campaigns", h: ["STEP", "GOT IT", "REPLIED", "WENT ON", "IN THE STEP NOW"], rows,
      take: stepTake(steps),
      empty: v.campaign === null ? "Steps belong to one campaign. Pick a campaign on the left." : v.steps === null
        ? "This campaign runs on the older plan, so it has no path steps. Template shows what each message got." : "This path has no message steps yet.",
      tail: canFold ? (
        <div className="wan-row"><button type="button" className="wt-btn is-ghost" onClick={() => setShowAll(!showAll)}>{folded ? `Show all ${steps.length} steps` : "Fold the later Intro messages"}</button></div>
      ) : null,
    };
  }
  if (split === "template") {
    return {
      title: "By template", note: "Version A and B shown apart", h: ["TEMPLATE", "SENT", "REPLIED", "WENT ON", "LANGUAGE"],
      rows: v.templates.map((t) => ({
        key: String(t.id), name: t.name,
        sub: [CATEGORY_LABEL[t.category as keyof typeof CATEGORY_LABEL] ?? "Older template", t.version, t.version === "B" && !t.archived ? "testing" : "", t.archived ? "archived" : ""].filter(Boolean).join(" · "),
        n: t.sends, rep: { part: t.replies, whole: t.sends }, next: { part: t.went_on, whole: t.sends }, last: langOf(t.languages),
      })),
      take: templateTake(v.templates), empty: "No template went out in this period.",
    };
  }
  if (split === "segment") {
    return {
      title: "By segment", note: "The segment on each contact", h: ["SEGMENT", "PEOPLE", "REPLIED", "SAID YES", "PAID"],
      rows: v.segments.map((s) => ({
        key: s.segment, name: s.segment, sub: s.cities.join(", "), n: s.people,
        rep: { part: s.replied, whole: s.people }, next: { part: s.yes, whole: s.people }, last: String(s.paid),
      })),
      take: segmentTake(v.segments), empty: "Nobody got a first message in this period.",
    };
  }
  if (split === "language") {
    return {
      title: "English vs Hinglish", note: "The language of each person’s first message", h: ["LANGUAGE", "PEOPLE", "REPLIED", "SAID YES", "STOP"],
      rows: v.languages.map((l) => ({
        key: l.language, name: l.label, sub: `${l.messages} ${l.messages === 1 ? "message" : "messages"}`, n: l.people,
        rep: { part: l.replied, whole: l.people }, next: { part: l.yes, whole: l.people }, last: String(l.stopped),
      })),
      take: languageTake(v.languages), empty: "",
    };
  }
  if (split === "slot") {
    const most = Math.max(0, ...v.slots.map((s) => s.sent));
    return {
      title: "By send slot", note: "India time, Mon–Sat", h: ["SLOT", "SENT", "REPLIED", "REPLIED SAME DAY", "AVG. FIRST REPLY"],
      rows: v.slots.map((s) => ({
        key: s.slot, name: s.label, sub: [s.name, most && s.sent === most ? "most sends" : ""].filter(Boolean).join(" · "), n: s.sent,
        rep: { part: s.replied, whole: s.sent }, next: { part: s.same_day, whole: s.sent }, last: waitText(s.first_reply_secs),
      })),
      take: slotTake(v.slots), empty: "",
    };
  }
  return {
    title: "By coupon code", note: "Used counts every use of the code, from any channel", h: ["CODE", "SHOWN TO", "REPLIED", "USED", "PCS PAID"],
    rows: v.codes.map((c) => ({
      key: c.code, name: c.code, sub: codeSub(c), n: c.shown_to,
      rep: { part: c.replied, whole: c.shown_to },
      next: { part: c.used, whole: c.shown_to, text: c.shown_to ? undefined : c.used ? `${c.used} used` : "—" }, last: String(c.pcs_paid),
    })),
    take: codeTake(v.codes), empty: "No WhatsApp template carries a coupon code yet. Add one to an Offer template in Templates.",
  };
}

// --- Download as sheet -----------------------------------------------------------------------------------------------

const csvCell = (v: string | number): string => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
function download(name: string, rows: (string | number)[][]): void {
  const blob = new Blob([`\uFEFF${rows.map((r) => r.map(csvCell).join(",")).join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function sheet(v: WaView, name: string, periodL: string): void {
  const k = v.kpis;
  const rows: (string | number)[][] = [[name, periodL], [],
    ["People messaged", "Messages", "Replied", "Said YES", "Track set", "First PC", "Paid", "PCs paid", "Asked to stop"],
    [k.people, k.messages, k.replied, k.yes, k.track, k.first_pc, k.paid, k.paid_pcs, k.stopped]];
  (["step", "template", "segment", "language", "slot", "code"] as const).forEach((s) => {
    const t = tableFor(s, v, true, () => undefined);
    if (!t.rows.length) return;
    rows.push([], [t.title], [t.h[0], t.h[1], "DETAIL", t.h[2], `${t.h[2]} %`, t.h[3], `${t.h[3]} %`, t.h[4]]);
    t.rows.forEach((r) => rows.push([r.name, r.n, r.sub, r.rep.part, pctText(r.rep.part, r.rep.whole), r.next.part, pctText(r.next.part, r.next.whole), r.last]));
  });
  if (v.campaigns.length) {
    rows.push([], ["Campaigns"], ["Campaign", "Status", "People messaged", "Replied", "Replied %"]);
    v.campaigns.forEach((c) => rows.push([c.name, c.status, c.people, c.replied, pctText(c.replied, c.people)]));
  }
  download(`zinwe-whatsapp-analytics-${v.period === "all" ? "since-day-1" : `last-${v.period}-days`}.csv`, rows);
}

// --- The tab ---------------------------------------------------------------------------------------------------------

export function AnalyticsTab({ data, campaigns }: { data: WaAnalytics; campaigns: WaCampaign[]; templates?: WaTemplate[] }): ReactElement {
  const [pick, setPick] = useState<number | null>(null);
  const [split, setSplit] = useState<Split>("overview");
  const [period, setPeriod] = useState<WaPeriod>("all");
  const [view, setView] = useState<WaView | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const { on: tipOn, node: tipNode, setTip } = useTip();
  const list = campaigns as WaCampaignX[];

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError("");
    getWaView(pick, period)
      .then((v) => { if (alive) { setView(v); setBusy(false); } })
      .catch((err) => { if (alive) { setError(errText(err, "Couldn't load the numbers.")); setBusy(false); } });
    return () => { alive = false; };
  }, [pick, period, tick]);

  const menuCamps = view?.campaigns ?? data.campaigns.map((c) => ({ id: c.id, name: c.name, status: c.status, engine: "", people: c.messaged, replied: c.replied }));
  const camp = pick === null ? null : list.find((c) => c.id === pick) ?? null;
  const row = pick === null ? null : menuCamps.find((c) => c.id === pick) ?? null;
  const name = pick === null ? "All campaigns" : camp?.name ?? row?.name ?? "Campaign";
  const periodL = PERIOD_LABEL[period].toLowerCase();
  const state = (s: string | undefined, day?: number) => [STATUS[s ?? ""]?.[0] ?? "Draft", day ? `day ${day}` : ""].filter(Boolean).join(" · ");
  const statusLine = pick === null ? `${menuCamps.length} ${menuCamps.length === 1 ? "campaign" : "campaigns"}` : state(row?.status ?? camp?.status, camp?.day);
  const table = useMemo(() => (view && split !== "overview" ? tableFor(split, view, showAll, setShowAll) : null), [view, split, showAll]);
  // The Overview shows the path's steps under the charts (the templates for all campaigns or an older campaign).
  const overviewTable = useMemo(() => (view && split === "overview" ? tableFor(view.steps?.length ? "step" : "template", view, showAll, setShowAll) : null), [view, split, showAll]);
  const count = (s: Exclude<Split, "overview">): number => {
    if (!view) return 0;
    return { step: view.steps ? stepRows(view.steps, showAll).length : 0, template: view.templates.length, segment: view.segments.length,
      language: view.languages.length, slot: view.slots.filter((x) => x.slot !== "other").length, code: view.codes.length }[s];
  };
  const pickSplit = (s: Split, close: () => void) => { setSplit(s); close(); };
  const current = split === "overview" ? name : `${SPLITS.find((s) => s.key === split)?.label} · ${name}`;

  return (
    <WtShell label="Campaigns and splits" current={current} side={(close) => (
      <>
        <div className="wt-sec">
          <div className="wt-sech"><span>CAMPAIGN</span></div>
          {menuCamps.map((c) => {
            const x = list.find((y) => y.id === c.id);
            return (
              <SideItem key={c.id} on={pick === c.id} onPick={() => { setPick(c.id); close(); }} label={c.name} dot={STATUS[c.status]?.[1] ?? "var(--ink-4)"}
                sub={[state(c.status, x?.day), `${c.people} ${c.people === 1 ? "person" : "people"}`].join(" · ")}
                chip={<RateChip replied={c.replied} sent={c.people} tip={c.people ? `Replied: ${c.replied} of ${c.people} people` : "Nobody messaged yet"} />} />
            );
          })}
          <SideItem on={pick === null} onPick={() => { setPick(null); close(); }} label="All campaigns"
            sub={`${menuCamps.length} ${menuCamps.length === 1 ? "campaign" : "campaigns"}`}
            chip={view ? <RateChip replied={view.campaign === null ? view.kpis.replied : menuCamps.reduce((n, c) => n + c.replied, 0)}
              sent={view.campaign === null ? view.kpis.people : menuCamps.reduce((n, c) => n + c.people, 0)} tip="Replied, people" /> : undefined} />
        </div>
        <div className="wt-sec">
          <div className="wt-sech"><span>VIEW</span></div>
          <SideItem on={split === "overview"} onPick={() => pickSplit("overview", close)} label="Overview" sub="Funnel, days, steps" />
        </div>
        <div className="wt-sec">
          <div className="wt-sech"><span>SPLIT BY</span></div>
          {SPLITS.map((s) => (
            <SideItem key={s.key} on={split === s.key} onPick={() => pickSplit(s.key, close)} label={s.label} sub={s.sub}
              chip={view ? <Count n={count(s.key)} quiet /> : undefined} />
          ))}
        </div>
      </>
    )}>
      <div className="wt-head">
        <div>
          <h2>{split === "overview" ? name : `${table?.title ?? ""} · ${name}`}</h2>
          <p>{split === "overview" ? `${statusLine} · ${periodL}. What was sent, who replied and what they did next.` : `Pick another split on the left. ${statusLine} · ${periodL}.`}</p>
        </div>
        <div className="wt-tools">
          <label className="wt-sel">Period
            <select value={period} aria-label="Period" onChange={(e) => setPeriod(e.target.value as WaPeriod)}>
              <option value="all">{PERIOD_LABEL.all}</option>
              <option value="30">{PERIOD_LABEL["30"]}</option>
              <option value="7">{PERIOD_LABEL["7"]}</option>
            </select>
          </label>
          {pick !== null ? <Link className="wt-btn" to={`/marketing/whatsapp/campaigns/${pick}`}>Open the campaign</Link> : null}
          <button type="button" className="wt-btn" disabled={!view} onClick={() => view && sheet(view, name, PERIOD_LABEL[period])}>Download as sheet</button>
        </div>
      </div>
      {error && !view ? (
        <div className="wan-error" role="alert"><span>{error}</span><button type="button" className="wt-btn" onClick={() => setTick((n) => n + 1)}>Try again</button></div>
      ) : !view ? (
        <div className="wan-loading" aria-busy="true">Loading the numbers…</div>
      ) : (
        <div className={"wan-body" + (busy ? " is-busy" : "")} aria-busy={busy}>
          {error ? <div className="wan-error" role="alert"><span>{error}</span><button type="button" className="wt-btn" onClick={() => setTick((n) => n + 1)}>Try again</button></div> : null}
          <Kpis v={view} />
          {split === "overview" ? (
            <>
              <Funnel v={view} tipOn={tipOn} periodL={periodL} />
              <Days v={view} setTip={setTip} />
              {overviewTable ? <SplitTable t={overviewTable} tipOn={tipOn} /> : null}
            </>
          ) : table ? <SplitTable t={table} tipOn={tipOn} /> : null}
          <p className="wt-foot wan-foot">
            Replied = people who wrote back within 3 days of a message ÷ people who got it. Bars are on one scale per column, 0–100 %.
            {period === "all" ? " Numbers start from day 1 of each campaign" : " People are those whose first message went out in the period; what they did next counts to today"}; a contact in two campaigns counts in each.
          </p>
        </div>
      )}
      {tipNode}
    </WtShell>
  );
}
