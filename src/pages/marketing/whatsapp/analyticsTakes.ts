/**
 * Analytics takeaways (wa4): one line under each card, written by simple rules from the numbers on screen. They only
 * restate what the data shows; with too little data they say so instead of picking a winner.
 */
import type { WaViewCode, WaViewLanguage, WaViewSegment, WaViewSlot, WaViewStep, WaViewTemplate } from "../../../lib/whatsappApi.analytics";

/** Below this many sends (or people) a row is too small to call best or weakest. */
export const ENOUGH = 5;
/** The owner's bar before choosing a winner between two versions or two languages. */
export const TEST_SIZE = 30;
export const AB_SIZE = 50;

export const rate = (part: number, whole: number): number => (whole ? Math.round((part / whole) * 100) : 0);
export const pctText = (part: number, whole: number): string => (whole ? `${rate(part, whole)} %` : "—");

/** The rows big enough to judge, or every row with something in it when none is. */
function judged<T>(rows: T[], size: (r: T) => number): T[] {
  const big = rows.filter((r) => size(r) >= ENOUGH);
  return big.length ? big : rows.filter((r) => size(r) > 0);
}

export function funnelTake(f: { label: string; people: number }[]): string {
  const [messaged, replied, yes, , , paid] = f.map((x) => x.people);
  if (!messaged) return "Nobody got a first message in this period.";
  let out = `${100 - rate(replied, messaged)} % of the people messaged never wrote back.`;
  const paidPart = yes && paid <= yes ? `; of those who said YES, ${rate(paid, yes)} % paid so far.` : ".";
  if (replied && yes <= replied) out += ` Of those who replied, ${rate(yes, replied)} % said YES${paidPart}`;
  else if (yes) out += ` ${yes} said YES${paidPart}`;
  return out;
}

const GROUP_DAYS = / · days? (\d+)\s*[-–]\s*(\d+)$/i;
/** "Intro · Opener"; a group of Intro messages keeps its own name ("26 Intro messages"); other lanes as the path says. */
export const stepName = (s: Pick<WaViewStep, "lane" | "title" | "label" | "k">): string => {
  if (s.lane !== "main") return s.label;
  return s.k === "group" ? s.title.replace(GROUP_DAYS, "") : `Intro · ${s.title}`;
};
/** "Day 4", or "Days 13–88" for a group. */
export const stepDays = (s: Pick<WaViewStep, "day" | "title">): string => {
  if (s.day) return `Day ${s.day}`;
  const m = GROUP_DAYS.exec(s.title);
  return m ? `Days ${m[1]}–${m[2]}` : "";
};
/** Replies are the goal on the Intro steps; the reply lanes are judged by who went on. */
export const judgedSteps = (steps: WaViewStep[]): WaViewStep[] => {
  const main = steps.filter((s) => s.lane === "main" && s.sent > 0);
  return main.length ? main : steps;
};

export function stepTake(steps: WaViewStep[]): string {
  const rows = judged(judgedSteps(steps), (s) => s.sent);
  if (!rows.length) return "Nothing has gone out from this path in this period.";
  const weak = rows.reduce((a, b) => (b.reply_rate < a.reply_rate ? b : a));
  const best = rows.reduce((a, b) => (b.reply_rate > a.reply_rate ? b : a));
  if (rows.length === 1 || weak.reply_rate === best.reply_rate) {
    return `${stepName(weak)}: ${weak.reply_rate} % replied from ${weak.sent} sent.`;
  }
  const after = weak.went_on ? `and ${rate(weak.went_on, weak.sent)} % went on.` : "and nobody went on after it.";
  return `${stepName(weak)}${stepDays(weak) ? ` (${stepDays(weak).toLowerCase()})` : ""} is the weak step: ${weak.reply_rate} % replied ${after} `
    + `The best is ${stepName(best)} (${best.reply_rate} %). Try a version B of the weak one in Templates.`;
}

export function templateTake(rows: WaViewTemplate[]): string {
  if (!rows.length) return "No template went out in this period.";
  const b = rows.find((r) => r.version === "B" && !r.archived && r.sends && rows.some((a) => a.id === r.version_of && a.sends));
  if (b) {
    const a = rows.find((x) => x.id === b.version_of) as WaViewTemplate;
    const lead = b.reply_rate > a.reply_rate ? "leads" : b.reply_rate < a.reply_rate ? "trails" : "ties with";
    const wait = Math.min(a.sends, b.sends) < AB_SIZE ? ` It needs ${AB_SIZE} sends each before you keep one.` : " Both have enough sends to keep one.";
    return `Version B of ${a.name} ${lead} A after ${b.sends} sends (${b.reply_rate} % vs ${a.reply_rate} %).${wait}`;
  }
  const judge = judged(rows, (r) => r.sends);
  if (judge.length < 2) return `${judge[0].name}: ${judge[0].reply_rate} % replied from ${judge[0].sends} sent.`;
  const best = judge.reduce((x, y) => (y.reply_rate > x.reply_rate ? y : x));
  const weak = judge.reduce((x, y) => (y.reply_rate < x.reply_rate ? y : x));
  if (best.reply_rate === weak.reply_rate) return `Every template got ${best.reply_rate} % replies so far.`;
  return `${best.name} gets the most replies (${best.reply_rate} %); ${weak.name} the fewest (${weak.reply_rate} %).`;
}

export function segmentTake(rows: WaViewSegment[]): string {
  const judge = judged(rows, (r) => r.people);
  if (!judge.length) return "Nobody got a first message in this period.";
  if (judge.length === 1) {
    const s = judge[0];
    return `${s.segment}: ${rate(s.replied, s.people)} % replied and ${rate(s.yes, s.people)} % said YES.`;
  }
  const by = (f: (r: WaViewSegment) => number) => judge.reduce((x, y) => (f(y) > f(x) ? y : x));
  const rep = (r: WaViewSegment) => rate(r.replied, r.people);
  const yes = (r: WaViewSegment) => rate(r.yes, r.people);
  const top = by(rep);
  const topYes = by(yes);
  const low = judge.reduce((x, y) => (rep(y) < rep(x) ? y : x));
  let out = top === topYes
    ? `${top.segment} replies most (${rep(top)} %) and says YES most (${yes(top)} %).`
    : `${top.segment} replies most (${rep(top)} %); ${topYes.segment} says YES most (${yes(topYes)} %).`;
  if (low !== top && rep(low) < rep(top)) out += ` ${low.segment} replies least (${rep(low)} %).`;
  if (judge.some((r) => r.people < TEST_SIZE)) out += ` Wait for ${TEST_SIZE} people in each before you choose.`;
  return out;
}

export function languageTake(rows: WaViewLanguage[]): string {
  const [x, y] = rows;
  if (!x || !y || (!x.people && !y.people)) return "Nobody got a first message in this period.";
  if (!x.people || !y.people) {
    const one = x.people ? x : y;
    return `Only ${one.label} went out in this period. Set a campaign to “Half English, half Hinglish” to compare.`;
  }
  const [win, lose] = rate(x.replied, x.people) >= rate(y.replied, y.people) ? [x, y] : [y, x];
  const a = rate(win.replied, win.people);
  const b = rate(lose.replied, lose.people);
  let out = a === b ? `English and Hinglish get the same replies (${a} %)` : `${win.label} gets more replies (${a} % vs ${b} %)`;
  const sw = rate(win.stopped, win.people);
  const sl = rate(lose.stopped, lose.people);
  if (a !== b && sw < sl) out += " and fewer STOPs";
  else if (a !== b && sw > sl) out += " but more STOPs";
  out += ".";
  if (Math.min(x.people, y.people) < TEST_SIZE) out += ` Wait for ${TEST_SIZE} people in each before choosing a winner.`;
  return out;
}

export function slotTake(rows: WaViewSlot[]): string {
  const real = rows.filter((r) => r.slot !== "other");
  const judge = judged(real, (r) => r.sent);
  if (!judge.length) return "Nothing went out in a send slot in this period.";
  const r = (s: WaViewSlot) => rate(s.replied, s.sent);
  const best = judge.reduce((a, b) => (r(b) > r(a) ? b : a));
  if (judge.length === 1) return `Everything went out at ${best.label}: ${r(best)} % replied.`;
  const fewest = judge.reduce((a, b) => (b.sent < a.sent ? b : a));
  let out = `The ${best.label} slot gets the most replies (${r(best)} %)`;
  if (fewest === best && judge.some((s) => s.sent > best.sent)) out += " but sends the least. Move a few messages there in Settings.";
  else out += ".";
  return out;
}

export function codeTake(rows: WaViewCode[]): string {
  const seen = rows.filter((c) => c.shown_to).sort((a, b) => b.shown_to - a.shown_to);
  const later = rows.find((c) => c.status === "scheduled");
  const soon = later ? ` ${later.code} starts on ${new Date(`${later.starts_on}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.` : "";
  if (!rows.length) return "No WhatsApp template carries a coupon code yet. Add one to an Offer template.";
  if (!seen.length) return `No offer with a code went out in this period.${soon}`;
  const top = seen[0];
  return `${top.code} was shown to ${top.shown_to} ${top.shown_to === 1 ? "person" : "people"} and used ${top.used} ${top.used === 1 ? "time" : "times"}.${soon}`;
}
