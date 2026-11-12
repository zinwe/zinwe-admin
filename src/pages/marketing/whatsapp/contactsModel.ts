/**
 * The Contacts tab's lists, words and dates (owner's board, 12 Nov 2026). The server sends where / need / next for each
 * contact (wa_contact_view.py); an older server doesn't, so the fallbacks here work them out from the fields it has.
 */
import type { WaCampaignX } from "../../../lib/whatsappApi.tabs";
import type { WaContactC, WaContactCounts, WaNeed, WaNext, WaWhere, WaWhereKey } from "../../../lib/whatsappApi.contacts";
import { LANG_LABEL, TRACKS } from "./shared";

export const SHORT_TRACK: Record<"privacy" | "activity" | "both", string> = { privacy: "Data Privacy", activity: "Team Activity", both: "Both Pack" };

/** The menu's lists: [label, the list's description]. Order = the board's. */
export const WHERE_LISTS: [WaWhereKey, string, string, string][] = [
  ["intro", "On Intro", "No reply yet", "Getting the Intro messages by day. No reply yet."],
  ["replied", "Replied, not sorted", "Sort on Today", "They wrote back. Sort the reply on Today: YES, Not now or STOP."],
  ["yes", "YES path", "Engage to Offer", "Said YES: Engage, Track, Demo videos, Setup, Offer."],
  ["notnow", "Not now", "Wait, then Intro", "Said not now. They wait, then go back to Intro."],
  ["paid", "Paid", "Goal reached", "Reached the goal. The testimonial request goes 14 days after the first PC."],
  ["stop", "Stopped", "Never again", "Said STOP, band karo or mat bhejo. Never messaged again."],
  ["locked", "Not opted in", "Locked", "Locked until they agree to hear from us on WhatsApp."],
];
/** Segment dots: the tag palette, in turn. */
export const SEG_DOTS = ["#24508f", "#7a4fb5", "#0f766e", "#9c5b2e", "#54656f", "#17663f", "#c0331c", "#f26a0a"];

const stopped = (c: WaContactC) => c.status === "stop" || c.campaign_status === "opted_out";
const yes = (c: WaContactC) => !!c.yes_date || c.status === "interested" || c.status === "signed" || c.lane === "yes";

/** Said YES on a campaign with a Track (the 90-day plan, or a path), Track not set yet. */
export function trackToSet(c: WaContactC): boolean {
  return !c.track && !!c.yes_date && (c.plan === "ninety" || c.engine === "path") && c.campaign_status !== "paid" && !stopped(c);
}

export function whereOf(c: WaContactC): WaWhere {
  if (c.where) return c.where;
  const key: WaWhereKey = stopped(c) ? "stop" : !c.opted_in ? "locked" : c.campaign_status === "paid" ? "paid" : yes(c) ? "yes"
    : c.status === "notnow" || c.lane === "notnow" ? "notnow" : c.status === "replied" ? "replied" : c.campaign || c.step > 0 ? "intro" : "none";
  const label = { stop: "Stopped", locked: "Not opted in", paid: "Paid", yes: "YES path", notnow: "Not now", none: "No campaign yet" }[key as string]
    ?? (c.day ? `Intro · day ${c.day}` : "Intro · not started");
  return { key, label, sub: c.step_label ?? "" };
}

export function needOf(c: WaContactC): WaNeed {
  if (c.need !== undefined) return c.need;
  if (stopped(c)) return "";
  if (c.needs_reply) return "reply";
  if (trackToSet(c)) return "track";
  return c.opted_in ? "" : "optin";
}

export function nextOf(c: WaContactC): WaNext {
  if (c.next) return c.next;
  const blank = { slot: "", send_kind: "" as const };
  if (stopped(c)) return { state: "never", label: "Blocked in every campaign", when: null, ...blank };
  if (!c.opted_in) return { state: "locked", label: "Until they agree", when: null, ...blank };
  if (c.needs_reply) return { state: "reply", label: "Answer on Today", when: null, ...blank };
  if (!c.campaign) return { state: "none", label: "Add them to a campaign", when: null, ...blank };
  return c.next_due ? { state: "planned", label: c.step_label ?? "", when: c.next_due, ...blank } : { state: "none", label: "", when: null, ...blank };
}

/** The menu's counts from the contacts loaded (an older server has no /contacts/counts/). */
export function countLocally(contacts: WaContactC[], camps: Map<number, WaCampaignX>): WaContactCounts {
  const n: WaContactCounts = {
    all: contacts.length, added_week: 0, need: 0, need_by: { reply: 0, track: 0, optin: 0 },
    where: { intro: 0, replied: 0, yes: 0, notnow: 0, paid: 0, stop: 0, locked: 0, none: 0 },
    tracks: { privacy: 0, activity: 0, both: 0, unset: 0 }, segments: [], campaigns: {}, no_campaign: 0, languages: { en: 0, hi: 0 },
  };
  const week = Date.now() - 7 * 864e5;
  const segs = new Map<string, { count: number; cities: Map<string, number> }>();
  for (const c of contacts) {
    if (new Date(c.created_at).getTime() > week) n.added_week++;
    const need = needOf(c);
    if (need) { n.need++; n.need_by[need]++; }
    n.where[whereOf(c).key]++;
    if (c.track) n.tracks[c.track]++;
    if (trackToSet(c)) n.tracks.unset++;
    const s = segs.get(c.segment) ?? { count: 0, cities: new Map() };
    s.count++;
    if (c.city) s.cities.set(c.city, (s.cities.get(c.city) ?? 0) + 1);
    segs.set(c.segment, s);
    if (c.campaign) n.campaigns[String(c.campaign)] = (n.campaigns[String(c.campaign)] ?? 0) + 1;
    else n.no_campaign++;
    const l = langOf(c, camps);
    if (l) n.languages[l]++;
  }
  n.segments = [...segs.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([segment, s]) => ({ segment, count: s.count, cities: [...s.cities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k) }));
  return n;
}

/** The contact's language: the server's, else their first message's, else the campaign's when it has one. */
export function langOf(c: WaContactC, camps: Map<number, WaCampaignX>): "en" | "hi" | "" {
  if (c.language === "en" || c.language === "hi") return c.language;
  if (c.lang === "en" || c.lang === "hi") return c.lang;
  const l = c.campaign ? camps.get(c.campaign)?.language : undefined;
  return l === "en" || l === "hi" ? l : "";
}

/** A person's first name when we know one ("Rohit"), else the business. */
export function displayName(c: WaContactC): { name: string; person: boolean } {
  const person = !!c.first_name && !!c.greet_as && !c.greet_as.endsWith(" team");
  return { name: person ? c.greet_as : c.short_name || c.firm, person };
}

export function contactSub(c: WaContactC, camps: Map<number, WaCampaignX>): string {
  const { person } = displayName(c);
  const l = langOf(c, camps);
  return [person ? c.short_name || c.firm : "", c.city, l ? LANG_LABEL[l] : ""].filter(Boolean).join(" · ");
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const asDate = (iso: string) => new Date(iso.length > 10 ? iso : `${iso}T12:00:00`);

/** Today / Tomorrow / Yesterday / Mon 11 Jan. */
export function dayWord(iso: string | null | undefined, cap = true): string {
  if (!iso) return "";
  const d = asDate(iso);
  const today = new Date();
  const gap = Math.round((asDate(ymd(d)).getTime() - asDate(ymd(today)).getTime()) / 864e5);
  const w = gap === 0 ? "today" : gap === 1 ? "tomorrow" : gap === -1 ? "yesterday" : "";
  if (w) return cap ? w[0].toUpperCase() + w.slice(1) : w;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
}

/** "today 10:14", "yesterday", "Wed 16 Dec". */
export function whenSaid(iso: string): string {
  const w = dayWord(iso, false);
  if (w === "today") return `today ${asDate(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return w;
}

/** The NEXT column: [main line, small line]. */
export function nextLines(n: WaNext, campaign?: WaCampaignX): [string, string] {
  const slot = n.slot ? ` ${n.slot}` : "";
  switch (n.state) {
    case "due": return [`Today${slot}`, n.label];
    case "planned": return [`${dayWord(n.when)}${slot}`, n.label];
    case "hold": return [n.label, "Nothing goes until then"];
    case "reply": return ["Answer on Today", "Their reply is waiting"];
    case "paused": return [n.when ? `After ${dayWord(n.when, false)}` : campaign && campaign.status !== "live" ? `When ${campaign.name} is live` : "When you resume", n.label];
    case "never": return ["Never", n.label || "Blocked in every campaign"];
    case "locked": return ["Locked", n.label || "Until they agree"];
    case "done": return ["Nothing more", n.label];
    default: return ["—", n.label || "In no campaign"];
  }
}

export const TRACK_KEYS = TRACKS;

/** +91 99880 00001 / +1 415 555 0100: easier to read and to check against the phone. */
export function phoneText(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 11 && d.startsWith("1")) return `+1 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return e164;
}

/** Two letters for the avatar, from the words that start with a letter: "Verma & Verma CA" → VV. */
export function avatarOf(name: string): string {
  return name.replace(/^Dr\.? /i, "").split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w)).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}
