/** Typed client for /api/admin/marketing/wa/*: WhatsApp outreach. Nothing here sends a WhatsApp message. */
import { ApiError, request } from "./api";
import { getToken } from "./session";

const BASE = "/api/admin/marketing/wa";

export type WaStatus = "ready" | "messaged" | "replied" | "interested" | "signed" | "notnow" | "stop";
export type WaKind = "first" | "followup" | "touch3" | "touch4" | "interested" | "question" | "notnow" | "nurture";
export type WaMessageKind = "first" | "followup" | "touch" | "nurture" | "flow" | "custom" | "reply" | "theirs";
/** What the contact wants (100 Reviews campaign): "" = Unassigned. Set by staff from the Engage answer. On an older
 * after-YES template "" = every YES. */
export type WaTrack = "" | "privacy" | "activity" | "both";
/** The 90-day campaign's message categories; "" = an older template. Only Engage and Demo video carry a Track. */
export type WaCategory = "" | "outreach" | "engage" | "demo_video" | "setup" | "demo_call" | "offer" | "testimonial" | "quick_reply";
/** How far a contact got along the campaign path ("" = not started). */
export type WaCampaignStatus = "" | "messaged" | "replied" | "yes" | "engaged" | "track_assigned" | "demo_video_sent" | "setup" | "demo_call" | "offer" | "paid" | "no_reply" | "opted_out";
export type WaPack = "" | "startup" | "team";
export type WaTestimonial = "" | "written_asked" | "written" | "video_asked" | "video";
/** What a person can mark as sent: a step of the sequence, or a reply. */
/** custom = a one-off from Contacts → Send WhatsApp: it never moves the sequence. */
export type WaSendKind = "first" | "followup" | "touch3" | "touch4" | "nurture" | "reply" | "custom" | "flow";
export type WaGoal = "Conversations" | "Free signups" | "Installs" | "Paid plans";

export interface WaMessage {
  id: number;
  kind: WaMessageKind;
  text: string;
  at: string;
  by: string;
  /** The campaign template it came from, and its label ("Engage · Need discovery · Data Privacy · step 1"). */
  template?: number | null;
  label?: string;
}

export interface WaContact {
  id: number;
  campaign: number | null;
  campaign_name: string;
  phone: string;
  first_name: string;
  /** Who decides, when it isn't the contact: {{OwnerName}} (wa2 backend; older servers leave it out). */
  owner_name?: string;
  /** The "how we know them" line fill() writes, when the server sends it (else the page reads info.how_we_know). */
  how_we_know?: string;
  /** Which details an If finds known for this contact (wa_conditions.known), on the wa2 server. */
  known?: Partial<Record<"FirstName" | "OwnerName" | "Business" | "City" | "HowWeKnow", boolean>>;
  salutation_hi?: string;
  firm: string;
  segment: string;
  country: string;
  city: string;
  source: string;
  info: Record<string, string>;
  status: WaStatus;
  step: number;
  next_date: string | null;
  needs_reply: boolean;
  paused_until: string | null;
  created_at: string;
  last: { kind: WaMessageKind; text: string; at: string } | null;
  track: WaTrack;
  yes_date: string | null;
  nurture_day: number;
  first_sent: string | null;
  opted_in: boolean;
  opt_in_note: string;
  /** How drafts address them: their first name when it clearly is one, else "<Business> team". */
  greet_as: string;
  /** How a message opens: "Hi Rohit", or "Hello Webgross team" without a real first name. */
  salutation?: string;
  /** The business name without SEO words, legal suffixes or fancy letters. */
  short_name: string;
  messages?: WaMessage[];
  /** The 90-day campaign (100 Reviews). */
  campaign_status?: WaCampaignStatus;
  /** Day 1-90 from their first message (0 = not started) and its stage 1-3. */
  day?: number;
  stage?: number;
  /** The campaign's plan: "ninety" = the 90-day campaign. */
  plan?: "" | "touches" | "ninety";
  out_day?: number;
  engage_step?: number;
  demo_step?: number;
  setup_step?: number;
  demo_call_sent?: boolean;
  offer_sent?: string | null;
  setup_error?: boolean;
  using_since?: string | null;
  pack?: WaPack;
  testimonial?: WaTestimonial;
}

export interface WaStats {
  contacts: number;
  messaged: number;
  replied: number;
  interested: number;
  signed: number;
  stopped: number;
  /** Opted in and not asked to stop: who can get a message at all. */
  opted_in?: number;
  /** Opted in and not messaged yet: the first messages waiting. */
  ready?: number;
}

export interface WaCampaign {
  id?: number;
  name: string;
  audience: number | null;
  audience_name?: string;
  goal: WaGoal;
  status?: "draft" | "live" | "paused";
  daily_limit: number;
  followup_days: number;
  first: number | null;
  followup: number | null;
  interested: number | null;
  question: number | null;
  notnow: number | null;
  touch3: number | null;
  touch4: number | null;
  touch3_days: number;
  touch4_days: number;
  /** Cold messages in English, Hinglish, or ab = half and half, to compare in Analytics. */
  language?: WaLanguage | "ab";
  /** ninety = the 90-day campaign: Outreach templates by day, then the YES path by Track. */
  plan?: "touches" | "ninety";
  stats?: WaStats;
}

/** A picture or video staff attach in WhatsApp by hand: wa.me links carry text only. */
export interface WaMedia {
  kind: "image" | "video";
  name: string;
  size: number;
  url: string;
}

/** The outreach structure (wa_structure.py): same parts, same order, every template; only the words change.
 * creative and notes are never sent. */
export interface WaParts {
  creative?: string;
  intro?: string;
  problem?: string;
  solution?: string;
  reward?: string;
  cta?: string;
  details?: string;
  notes?: string;
}

/** en = English, hi = Hinglish. */
export type WaLanguage = "en" | "hi";

export interface WaTemplate {
  id?: number;
  name: string;
  kind: WaKind;
  language?: WaLanguage;
  /** The same message in the other language; a campaign in Hinglish or 50/50 sends it. */
  twin?: number | null;
  /** Composed from `parts` by the backend when the template is structured. */
  text: string;
  /** Empty = a free-text template. */
  parts?: WaParts;
  track?: WaTrack;
  day?: number;
  media?: WaMedia | null;
  /** Campaign rows: English in `text`, Hinglish in `text_hi`, a draft until both are written. */
  category?: WaCategory;
  type_name?: string;
  /** Outreach and Offer: stage 1-3. */
  stage?: number;
  /** Outreach: the day 1-90. Engage, Demo video: step 1-6. Setup, Testimonial: 1-2. */
  step?: number;
  text_hi?: string;
  coupon?: number | null;
  coupon_info?: { code: string; percent_off: number; plan_codes: string[]; starts_on: string; ends_on: string | null; status: string } | null;
  /** Offer: a festival code; the queue never picks it, staff do. */
  event?: boolean;
  archived?: boolean;
  draft?: boolean;
  performance?: { sends: number; replies: number; next: number } | null;
  /** The Templates page (wa2): the template's tags; send `tag_ids` to change them. */
  tags?: WaTag[];
  tag_ids?: number[];
  /** Last 30 days of this row's own sends (version A's numbers when a B is being tested). The wa2 server puts these
   * keys (WaNumbers) on the template itself; `stats` is read too. Older servers send only `performance`. */
  stats?: WaNumbers | null;
  stats_days?: number;
  /** The A/B test: version B's texts and numbers, or null. A B row itself has `version_of` and is never a card. */
  version_b?: WaVersionB | null;
  version_of?: number | null;
}

/** A label staff put on templates. `color` is from the server's fixed palette. */
export interface WaTag {
  id: number;
  name: string;
  color: string;
}

/** Sends and replies over the last 30 days; rates are whole percents. _en / _hi: by the language it went out in. */
export interface WaNumbers {
  sends: number;
  replies: number;
  reply_rate?: number;
  next?: number;
  next_rate?: number;
  sends_en?: number;
  replies_en?: number;
  reply_rate_en?: number;
  sends_hi?: number;
  replies_hi?: number;
  reply_rate_hi?: number;
}

export interface WaVersionB extends WaNumbers {
  id: number;
  name?: string;
  text: string;
  text_hi: string;
  draft?: boolean;
}

/** How many contacts (not opted out, not blocked) have each detail known, by the same rules as fill(). */
export interface WaReach {
  total: number;
  known: Record<"FirstName" | "OwnerName" | "Business" | "City" | "HowWeKnow", number>;
  /** Contact ids for the Preview as quick picks: one with a first name, one without, one with no names. */
  examples?: { first_name: number | null; no_first_name: number | null; no_names: number | null };
}

export interface WaFileRow {
  row: number;
  firm: string;
  phone: string;
  first_name: string;
  segment: string;
  country: string;
  city: string;
  source: string;
  info: Record<string, string>;
  result: "ready" | "warn" | "locked" | "bad";
  message: string;
}

export interface WaQueueItem {
  kind: Exclude<WaSendKind, "reply" | "custom">;
  template: string;
  /** 90-day campaign rows (kind "flow"): the template, its label, and whether it is still a draft. */
  template_id?: number | null;
  label?: string;
  category?: WaCategory;
  draft?: boolean;
  /** "set_track" = waiting for staff to set the contact's Track from their Engage answer. */
  note?: string;
  contact: WaContact;
}

export interface WaCampaignCounts {
  status: Partial<Record<Exclude<WaCampaignStatus, "">, number>>;
  track: Record<"privacy" | "activity" | "both", number>;
  track_to_set: number;
  reviews_written: number;
  reviews_video: number;
}

export interface WaToday {
  queue: WaQueueItem[];
  replies: WaContact[];
  sent_today: number;
  stats: WaStats;
  campaign?: WaCampaignCounts;
}

export interface WaAnalytics {
  total: WaStats;
  daily: { date: string; sent: number; replies: number }[];
  segments: { segment: string; messaged: number; replied: number }[];
  /** English vs Hinglish, by the language of each contact's first message. */
  languages?: { language: WaLanguage; label: string; messaged: number; replied: number; interested: number; stopped: number }[];
  campaigns: ({ id: number; name: string; status: string } & WaStats)[];
  blocked: number;
}

export interface WaChoice {
  include: boolean;
  segment: string;
  campaign: number | null;
}

const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const getToday = () => request<WaToday>(`${BASE}/today/`);
export const getWaContacts = () => request<WaContact[]>(`${BASE}/contacts/`);

/** One contact typed in the admin. Not opted in = added locked, as from a sheet. */
export interface WaNewContact {
  firm: string;
  phone: string;
  segment: string;
  country: "India" | "USA";
  city: string;
  first_name: string;
  source: string;
  campaign: number | null;
  opted_in: boolean;
  /** How they agreed, when opted in. */
  opt_in_note: string;
  /** Saved as Useful Info notes, for the personal first line. */
  notes: string;
}
/** 400 carries a message per field (ApiError.fields): firm, phone, segment, country, city, campaign. */
export const addWaContact = (c: WaNewContact) => request<WaContact>(`${BASE}/contacts/`, post(c));
export const getWaContact = (id: number) => request<WaContact>(`${BASE}/contacts/${id}/`);
export const patchWaContact = (id: number, patch: Partial<Pick<WaContact, "campaign" | "first_name" | "firm" | "segment" | "city" | "info" | "track" | "pack">>) =>
  request<WaContact>(`${BASE}/contacts/${id}/`, { method: "PATCH", body: JSON.stringify(patch) });
export const deleteWaContact = (id: number) => request<null>(`${BASE}/contacts/${id}/`, { method: "DELETE" });
/** `template` picks any template for a one-off (Contacts → Send WhatsApp); without it the campaign's template of `kind`. */
export const draftFor = (id: number, kind: WaKind | "flow", template?: number) => request<{ text: string; template: string; template_id?: number; label?: string; by: "claude" | "template"; media: WaMedia | null; creative?: string; notes?: string; language?: WaLanguage }>(`${BASE}/contacts/${id}/draft/`, post(template ? { kind, template } : { kind }));
/** `template`: the campaign template it came from. A campaign template (any category) moves the contact's path. */
export const markSent = (id: number, kind: WaSendKind, text: string, template?: number | null) => request<WaContact>(`${BASE}/contacts/${id}/sent/`, post(template ? { kind, text, template } : { kind, text }));
export const logReply = (id: number, text: string) => request<WaContact>(`${BASE}/contacts/${id}/reply/`, post({ text }));
export type WaAction = "interested" | "signed" | "notnow" | "stop" | "pause" | "resume" | "optin"
  /* 90-day campaign: `track` takes the Track in `note`. */
  | "track" | "paid" | "setup_error" | "setup_ok" | "using" | "review_written" | "review_video";
export const actOn = (id: number, action: WaAction, note = "") => request<WaContact>(`${BASE}/contacts/${id}/act/`, post({ action, note }));

function fileBody(file: File, choices?: Record<string, WaChoice>): FormData {
  const body = new FormData();
  body.append("file", file);
  if (choices) {
    body.append("add", "1");
    body.append("choices", JSON.stringify(choices));
  }
  return body;
}
export const reviewWaFile = (file: File) => request<{ rows: WaFileRow[] }>(`${BASE}/contacts/upload/`, { method: "POST", body: fileBody(file) });
export const addWaFile = (file: File, choices: Record<string, WaChoice>) => request<{ added: number }>(`${BASE}/contacts/upload/`, { method: "POST", body: fileBody(file, choices) });

export const getWaCampaigns = () => request<WaCampaign[]>(`${BASE}/campaigns/`);
export const getWaCampaign = (id: number) => request<WaCampaign>(`${BASE}/campaigns/${id}/`);
export const saveWaCampaign = (c: WaCampaign) =>
  c.id ? request<WaCampaign>(`${BASE}/campaigns/${c.id}/`, { method: "PATCH", body: JSON.stringify(c) }) : request<WaCampaign>(`${BASE}/campaigns/`, post(c));
export const deleteWaCampaign = (id: number) => request<null>(`${BASE}/campaigns/${id}/`, { method: "DELETE" });
export const waCampaignAction = (id: number, action: "start" | "pause") => request<WaCampaign>(`${BASE}/campaigns/${id}/${action}/`, { method: "POST" });
/** Add contacts by hand. Only those not messaged yet and not stopped move; the rest come back as `skipped`. */
export const addToWaCampaign = (id: number, ids: number[]) =>
  request<{ added: number; skipped: number; campaign: WaCampaign }>(`${BASE}/campaigns/${id}/contacts/`, { method: "POST", body: JSON.stringify({ ids }) });

export const getWaTemplates = () => request<WaTemplate[]>(`${BASE}/templates/`);
export const saveWaTemplate = (t: WaTemplate) =>
  t.id ? request<WaTemplate>(`${BASE}/templates/${t.id}/`, { method: "PUT", body: JSON.stringify(t) }) : request<WaTemplate>(`${BASE}/templates/`, post(t));
export const deleteWaTemplate = (id: number) => request<null>(`${BASE}/templates/${id}/`, { method: "DELETE" });
/** Starts an A/B test: version B with these texts (one B at a time). */
export const addWaVersion = (id: number, text: string, text_hi: string) => request<WaTemplate>(`${BASE}/templates/${id}/versions/`, post({ text, text_hi }));
/** Ends the test: B copies B's texts into A and archives B; A archives B. Both keep their history. */
export const keepWaVersion = (id: number, version: "A" | "B") => request<WaTemplate>(`${BASE}/templates/${id}/keep/`, post({ version }));
/** A copy named "<name> (copy)" with the same texts, category, step and tags. */
export const duplicateWaTemplate = (id: number) => request<WaTemplate>(`${BASE}/templates/${id}/duplicate/`, { method: "POST" });
/** Some fields only (archived, tag_ids...). */
export const patchWaTemplate = (id: number, patch: Partial<WaTemplate>) => request<WaTemplate>(`${BASE}/templates/${id}/`, { method: "PATCH", body: JSON.stringify(patch) });
export const getWaReach = () => request<WaReach>(`${BASE}/templates/reach/`);
export const getWaTags = () => request<WaTag[]>(`${BASE}/tags/`);
export const addWaTag = (name: string) => request<WaTag>(`${BASE}/tags/`, post({ name }));
export const deleteWaTag = (id: number) => request<null>(`${BASE}/tags/${id}/`, { method: "DELETE" });
export const uploadWaMedia = (id: number, file: File) => {
  const body = new FormData();
  body.append("file", file);
  return request<WaTemplate>(`${BASE}/templates/${id}/media/`, { method: "POST", body });
};
export const removeWaMedia = (id: number) => request<WaTemplate>(`${BASE}/templates/${id}/media/`, { method: "DELETE" });

/** The file itself, with the staff token (uploads are never public). */
export async function fetchWaMedia(url: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(url, { headers: token ? { Authorization: `Token ${token}` } : {} });
  if (!res.ok) throw new ApiError(`Couldn't load the file (${res.status}).`, res.status);
  return res.blob();
}

export const getWaAnalytics = () => request<WaAnalytics>(`${BASE}/analytics/`);

/** Opens the chat on WhatsApp (phone app or WhatsApp Web) with the text filled in. The person presses Send there. */
export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Saves the blank contact sheet. */
export async function downloadWaTemplate(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}/contact-template/`, { headers: token ? { Authorization: `Token ${token}` } : {} });
  if (!res.ok) throw new ApiError(`Couldn't download the template (${res.status}).`, res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "zinwe-whatsapp-contacts.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
