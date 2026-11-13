/**
 * WhatsApp → Contacts (wa4, 12 Nov 2026): the keys the server adds to the contact JSON for the Contacts tab, the
 * menu's counts and one contact's path (API_WA3.md section 5). Every key is optional: an older server leaves them out
 * and the tab works them out from the fields it already has. Nothing here sends a WhatsApp message.
 */
import { request } from "./api";
import type { WaContact, WaLanguage, WaSendKind } from "./whatsappApi";
import { missingRoute, type WaPathPos } from "./whatsappApi.tabs";

const BASE = "/api/admin/marketing/wa";

/** Where on the path, one per contact. */
export type WaWhereKey = "intro" | "replied" | "yes" | "notnow" | "paid" | "stop" | "locked" | "none";
export interface WaWhere {
  key: WaWhereKey;
  /** "Intro · day 34", "YES path · Track to set", "Stopped". */
  label: string;
  /** "No reply yet", "Said YES Fri 6 Nov", "Asked to stop, today". */
  sub: string;
}
/** What staff must do first. */
export type WaNeed = "" | "reply" | "track" | "optin";
export type WaNextState = "due" | "planned" | "hold" | "reply" | "paused" | "never" | "locked" | "done" | "none";
export interface WaNext {
  state: WaNextState;
  /** The message ("Intro · Question · day 34"), or what it waits for ("Set the Track"). */
  label: string;
  /** YYYY-MM-DD, or null. */
  when: string | null;
  /** The path step's time slot ("10–12") when it has one. */
  slot: string;
  /** The kind for /draft/ and /sent/ when the next message is a template. */
  send_kind: Exclude<WaSendKind, "reply" | "custom"> | "";
}
export interface WaLastMessage {
  text: string;
  at: string;
  direction: "in" | "out";
  by: string;
}
export type WaContactC = WaContact & WaPathPos & {
  /** "path" or "slots": the campaign's engine (the wa3 server). */
  engine?: string;
  where?: WaWhere;
  need?: WaNeed;
  next?: WaNext;
  last_message?: WaLastMessage | null;
  language?: WaLanguage;
};

export interface WaContactCounts {
  all: number;
  added_week: number;
  need: number;
  need_by: Record<Exclude<WaNeed, "">, number>;
  where: Record<WaWhereKey, number>;
  tracks: Record<"privacy" | "activity" | "both" | "unset", number>;
  segments: { segment: string; count: number; cities: string[] }[];
  /** campaign id → contacts. */
  campaigns: Record<string, number>;
  no_campaign: number;
  languages: Record<WaLanguage, number>;
}

export interface WaPathRow {
  state: "done" | "now" | "next";
  label: string;
  date: string | null;
  note: string;
  /** message (ours, sent or coming), event (added, Said YES, the Track, the first PC, paid), step (a wait, a hold). */
  kind?: "message" | "event" | "step";
}
export interface WaContactPath {
  campaign: number | null;
  campaign_name: string;
  campaign_status: string;
  engine: string;
  day: number;
  next: WaNext;
  steps: WaPathRow[];
  more: { count: number; last_date: string | null; last_day: number | null } | null;
}

/** null = this server doesn't have it yet (the tab counts what it loaded). */
export async function getWaContactCounts(): Promise<WaContactCounts | null> {
  try {
    return await request<WaContactCounts>(`${BASE}/contacts/counts/`);
  } catch (err) {
    if (missingRoute(err)) return null;
    throw err;
  }
}

/** null = this server doesn't have it yet (the panel leaves the path out). */
export async function getWaContactPath(id: number): Promise<WaContactPath | null> {
  try {
    return await request<WaContactPath>(`${BASE}/contacts/${id}/path/`);
  } catch (err) {
    if (missingRoute(err)) return null;
    throw err;
  }
}
