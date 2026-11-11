/**
 * Campaign paths (owner, 11 Nov 2026; board AdminWaCampaigns in _wa3, its script path90 / renderVals): the words, the
 * Day labels, the checks and the dates the builder shows. Reads the contract in whatsappApi.ts (WaPath).
 */
import type {
  WaCampaign, WaLane, WaPath, WaPathIssue, WaPathStep, WaScheduleRow, WaStepKind, WaTemplate, WaUnit,
} from "../../../../lib/whatsappApi";
import { CATEGORY_LABEL } from "../shared";
import { isDraft, type Cat } from "../templateModel";

export const LANES: WaLane[] = ["main", "yes", "notnow", "stop"];
/** In the step panel's kicker: "INTRO PATH · STEP 3". */
export const LANE_NAME: Record<WaLane, string> = { main: "Intro path", yes: "YES path", notnow: "Not now path", stop: "STOP path" };
/** The three reply columns under REPLY PATHS. */
export const REPLY_COLS: [Exclude<WaLane, "main">, string][] = [["yes", "They say YES"], ["notnow", "Not now"], ["stop", "STOP"]];

export const IC: Record<WaStepKind | "empty" | "listen", string> = {
  start: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  send: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  wait: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  reply: "M21 12a9 9 0 1 1-9-9M8 12h.01M12 12h.01M16 12h.01M21 3v5h-5",
  track: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  group: "M12 2l10 6-10 6L2 8zM2 16l10 6 10-6",
  goal: "M4 22V4h12l-2 4 2 4H4",
  goto: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  end: "M6 6h12v12H6z",
  empty: "M12 5v14M5 12h14",
  listen: "M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z",
};

/** The + menu, in the board's order and words. */
export const ADDS: [WaStepKind, string, string][] = [
  ["send", "Send a template", "Any template, from any category"],
  ["wait", "Wait", "Hours, days or weeks before the next step"],
  ["reply", "Wait for their answer", "Goes on when they answer, or after a time"],
  ["track", "Set the Track", "Data Privacy, Team Activity or Both"],
  ["goal", "Goal", "Paid, first PC or sign-up ends the path"],
  ["goto", "Go to", "Jump to another part of the path"],
  ["end", "End", "They leave this campaign here"],
];

export const GOAL_LABEL: Record<string, string> = { yes: "They say YES", signup: "Signed up", first_pc: "First PC set up", paid: "Paid" };
export const END_STATUS_LABEL: Record<string, string> = { no_reply: "No reply", opted_out: "Opted out", done: "Done" };

export type Status = "draft" | "live" | "paused" | "ended";
export const statusOf = (c: WaCampaign): Status => ((c.status as string | undefined) === "ended" ? "ended" : c.status ?? "draft");
export const STATUS_LABEL: Record<Status, string> = { live: "Live", draft: "Draft", paused: "Paused", ended: "Ended" };

/** A path from the server, made safe to draw: every lane an array, the main lane starting with Start. */
export function normalisePath(raw: unknown): WaPath {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<WaPath>;
  const lanes = (p.lanes ?? {}) as Partial<Record<WaLane, WaPathStep[]>>;
  const out: WaPath = { v: 1, lanes: { main: [], yes: [], notnow: [], stop: [] } };
  LANES.forEach((l) => {
    out.lanes[l] = Array.isArray(lanes[l]) ? lanes[l].filter((s) => s && typeof s.id === "string" && typeof s.k === "string") : [];
  });
  if (out.lanes.main[0]?.k !== "start") out.lanes.main.unshift({ id: uniqueId(out, "main", "s"), k: "start" });
  return out;
}

const allIds = (p: WaPath): Set<string> => new Set(LANES.flatMap((l) => p.lanes[l].map((s) => s.id)));
function uniqueId(p: WaPath, lane: WaLane, prefix?: string): string {
  const pre = prefix ?? { main: "m", yes: "y", notnow: "n", stop: "t" }[lane];
  const used = allIds(p);
  let i = 1;
  while (used.has(pre + i)) i += 1;
  return pre + i;
}

/** A new step of kind k with the board's defaults. */
export function blankStep(p: WaPath, lane: WaLane, k: WaStepKind): WaPathStep {
  const id = uniqueId(p, lane);
  switch (k) {
    case "send": return { id, k, template: null, only_if: "" };
    case "wait": return { id, k, n: 2, unit: "days", window: true };
    case "reply": return { id, k, n: 2, unit: "days" };
    case "goal": return { id, k, goal: "paid" };
    case "goto": return { id, k, lane: "main", step: "resume" };
    case "end": return { id, k, label: "Ends here", note: "They leave this campaign.", status: "done" };
    case "group": return { id, k, category: "outreach", count: 5, every: 3 };
    default: return { id, k };
  }
}
export const freshId = uniqueId;

export const hours = (s: Pick<WaPathStep, "n" | "unit">): number => (s.n ?? 0) * (s.unit === "hours" ? 1 : s.unit === "weeks" ? 168 : 24);
export const unitWord = (n: number, u: WaUnit | undefined): string =>
  u === "hours" ? (n === 1 ? "hour" : "hours") : u === "weeks" ? (n === 1 ? "week" : "weeks") : n === 1 ? "day" : "days";

export interface DayLabel {
  day: string;
  /** Main lane: the day number (a group's first day), and a group's last day. */
  d?: number;
  last?: number;
}

/** The Day labels on the path: the Intro path counts from day 1; reply paths count from the reply. */
export function dayLabels(lane: WaLane, steps: WaPathStep[]): Record<string, DayLabel> {
  const out: Record<string, DayLabel> = {};
  let h = 0;
  let first = true;
  steps.forEach((s) => {
    const day = 1 + Math.floor(h / 24);
    const extra = h % 24;
    if (lane === "main") {
      if (s.k === "send") out[s.id] = { day: `Day ${day}${extra ? ` +${extra} h` : ""}`, d: day };
      if (s.k === "group") {
        const every = Math.max(1, s.every ?? 1);
        const a = day + every;
        const b = a + every * (Math.max(1, s.count ?? 1) - 1);
        out[s.id] = { day: `Days ${a}–${b}`, d: a, last: b };
        h = (b - 1) * 24;
      }
      if (s.k === "wait" || s.k === "reply") h += hours(s);
    } else {
      const rel = Math.floor(h / 24);
      if (s.k === "send" || s.k === "group" || s.k === "goal" || s.k === "track") {
        out[s.id] = {
          day: first && h === 0 ? "On the reply" : h === 0 ? "Same day" : rel ? `+${rel} ${rel === 1 ? "day" : "days"}${extra ? ` ${extra} h` : ""}` : `+${extra} h`,
        };
      }
      if (s.k === "send") first = false;
      if (s.k === "wait" || s.k === "reply") h += hours(s);
      if (s.k === "group") h += 24 * Math.max(1, s.every ?? 1) * Math.max(1, s.count ?? 1);
    }
  });
  return out;
}

/** How long the Intro path runs, in days (for the bar and the list). */
export function pathDays(p: WaPath): number {
  const labels = dayLabels("main", p.lanes.main);
  return Object.values(labels).reduce((a, l) => Math.max(a, l.last ?? l.d ?? 0), 0);
}
export const stepCount = (p: WaPath): number => LANES.reduce((a, l) => a + p.lanes[l].filter((s) => s.k !== "start").length, 0);

/** A template's short label: "Intro · Problem". */
export function tplLabel(t: WaTemplate | undefined): string {
  if (!t) return "Pick a template";
  const cat = t.category ? CATEGORY_LABEL[t.category as Cat] : "Older";
  return `${cat} · ${t.type_name || t.name}`;
}

export interface PathIssue {
  lane?: WaLane;
  step?: string;
  text: string;
}

/** The server's rules (templates exist, waits > 0, every lane ends in End, Goal or Go to, unique ids), checked here
 * first so a half-built path shows what is missing instead of a failed save. */
export function checkPath(p: WaPath, templates: WaTemplate[]): PathIssue[] {
  const out: PathIssue[] = [];
  const byId = new Map(templates.map((t) => [t.id, t]));
  const seen = new Set<string>();
  LANES.forEach((lane) => {
    const list = p.lanes[lane];
    const where = (i: number) => `${LANE_NAME[lane]}, step ${lane === "main" ? i : i + 1}`;
    list.forEach((s, i) => {
      if (seen.has(s.id)) out.push({ lane, step: s.id, text: `${where(i)}: two steps share the id ${s.id}.` });
      seen.add(s.id);
      if (s.k === "send" && !s.template) out.push({ lane, step: s.id, text: `${where(i)}: pick a template.` });
      else if (s.k === "send" && !byId.has(s.template ?? undefined)) out.push({ lane, step: s.id, text: `${where(i)}: its template no longer exists. Pick another.` });
      if ((s.k === "wait" || s.k === "reply") && !((s.n ?? 0) > 0)) out.push({ lane, step: s.id, text: `${where(i)}: a wait must be longer than 0.` });
      if (s.k === "group" && (!((s.count ?? 0) > 0) || !((s.every ?? 0) > 0))) out.push({ lane, step: s.id, text: `${where(i)}: set how many messages and how often.` });
      if (s.k === "goto") {
        const target = s.lane ?? "main";
        const ok = s.step === "resume" ? target === "main" : p.lanes[target]?.some((x) => x.id === s.step);
        if (!ok) out.push({ lane, step: s.id, text: `${where(i)}: Go to points at a step that isn’t there any more.` });
      }
    });
    const last = list[list.length - 1];
    if (!list.length || (lane === "main" && list.length === 1)) out.push({ lane, text: `The ${LANE_NAME[lane]} has no steps yet.` });
    else if (!["end", "goal", "goto"].includes(last.k)) out.push({ lane, step: last.id, text: `The ${LANE_NAME[lane]} must end with End, Goal or Go to.` });
  });
  return out;
}

export function issueOf(x: WaPathIssue): PathIssue {
  if (typeof x === "string") return { text: x };
  return { lane: x.lane, step: x.step, text: x.message || x.detail || "Something on the path needs a look." };
}

/** Steps whose template is still a draft (Start waits for them to be written). */
export function draftSteps(p: WaPath, templates: WaTemplate[]): number {
  const byId = new Map(templates.map((t) => [t.id, t]));
  return LANES.reduce((a, l) => a + p.lanes[l].filter((s) => s.k === "send" && s.template && byId.get(s.template) && isDraft(byId.get(s.template) as WaTemplate)).length, 0);
}

/** The path in one line of chips, for a campaign card. */
export function miniOf(p: WaPath, templates: WaTemplate[]): { t: string; cls: string }[] {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const out: { t: string; cls: string }[] = [];
  p.lanes.main.forEach((s) => {
    if (s.k === "send") { const t = byId.get(s.template ?? undefined); out.push({ t: t ? t.type_name || t.name : "Pick a template", cls: "wf-chip" }); }
    if (s.k === "wait") out.push({ t: `→ ${s.n ?? 0}${s.unit === "hours" ? " h" : s.unit === "weeks" ? " wk" : " d"} →`, cls: "wf-chip is-wait" });
    if (s.k === "group") out.push({ t: `+${s.count ?? 0} more`, cls: "wf-chip is-more" });
  });
  const ys = p.lanes.yes.length;
  if (ys) out.push({ t: `YES path · ${ys} steps`, cls: "wf-chip is-more" });
  return out.slice(0, 11);
}

// ---- Real dates (the wait panel's "What it means for …") ----

const W = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (d: Date): string => `${W[d.getDay()]} ${d.getDate()} ${M[d.getMonth()]}`;
export const parseDay = (s: string): Date => new Date(s.length > 10 ? s : `${s}T12:00:00`);
const addDays = (d: Date, n: number): Date => {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
};

/** Day 1 for the preview: from the server's schedule when it has one, else the next working day. */
export function dayOne(rows: WaScheduleRow[] | null, today = new Date()): Date {
  const row = (rows ?? []).filter((r) => !r.moved_from && r.day > 0 && r.date).sort((a, b) => a.day - b.day)[0];
  if (row) return addDays(parseDay(row.date), 1 - row.day);
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return d.getDay() === 0 ? addDays(d, 1) : d;
}

/** Day n's date; with the window, a Sunday moves to Monday. */
export function dateOf(start: Date, day: number, windowed: boolean): { text: string; moved: boolean; day: number } {
  const d = addDays(start, day - 1);
  if (windowed && d.getDay() === 0) return { text: fmtDay(addDays(d, 1)), moved: true, day: day + 1 };
  return { text: fmtDay(d), moved: false, day };
}
