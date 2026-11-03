/** Typed client for /api/admin/marketing/wa/*: WhatsApp outreach. Nothing here sends a WhatsApp message. */
import { ApiError, request } from "./api";
import { getToken } from "./session";

const BASE = "/api/admin/marketing/wa";

export type WaStatus = "ready" | "messaged" | "replied" | "interested" | "signed" | "notnow" | "stop";
export type WaKind = "first" | "followup" | "interested" | "question" | "notnow";
export type WaMessageKind = "first" | "followup" | "reply" | "theirs";
export type WaGoal = "Conversations" | "Free signups" | "Installs" | "Paid plans";

export interface WaMessage {
  id: number;
  kind: WaMessageKind;
  text: string;
  at: string;
  by: string;
}

export interface WaContact {
  id: number;
  campaign: number | null;
  campaign_name: string;
  phone: string;
  first_name: string;
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
  messages?: WaMessage[];
}

export interface WaStats {
  contacts: number;
  messaged: number;
  replied: number;
  interested: number;
  signed: number;
  stopped: number;
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
  stats?: WaStats;
}

export interface WaTemplate {
  id?: number;
  name: string;
  kind: WaKind;
  text: string;
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
  result: "ready" | "warn" | "bad";
  message: string;
}

export interface WaToday {
  queue: { kind: "first" | "followup"; contact: WaContact }[];
  replies: WaContact[];
  sent_today: number;
  stats: WaStats;
}

export interface WaAnalytics {
  total: WaStats;
  daily: { date: string; sent: number; replies: number }[];
  segments: { segment: string; messaged: number; replied: number }[];
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
export const getWaContact = (id: number) => request<WaContact>(`${BASE}/contacts/${id}/`);
export const patchWaContact = (id: number, patch: Partial<Pick<WaContact, "campaign" | "first_name" | "firm" | "segment" | "city" | "info">>) =>
  request<WaContact>(`${BASE}/contacts/${id}/`, { method: "PATCH", body: JSON.stringify(patch) });
export const deleteWaContact = (id: number) => request<null>(`${BASE}/contacts/${id}/`, { method: "DELETE" });
export const draftFor = (id: number, kind: WaKind) => request<{ text: string; template: string; by: "claude" | "template" }>(`${BASE}/contacts/${id}/draft/`, post({ kind }));
export const markSent = (id: number, kind: "first" | "followup" | "reply", text: string) => request<WaContact>(`${BASE}/contacts/${id}/sent/`, post({ kind, text }));
export const logReply = (id: number, text: string) => request<WaContact>(`${BASE}/contacts/${id}/reply/`, post({ text }));
export const actOn = (id: number, action: "interested" | "signed" | "notnow" | "stop" | "pause" | "resume") => request<WaContact>(`${BASE}/contacts/${id}/act/`, post({ action }));

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

export const getWaTemplates = () => request<WaTemplate[]>(`${BASE}/templates/`);
export const saveWaTemplate = (t: WaTemplate) =>
  t.id ? request<WaTemplate>(`${BASE}/templates/${t.id}/`, { method: "PUT", body: JSON.stringify(t) }) : request<WaTemplate>(`${BASE}/templates/`, post(t));
export const deleteWaTemplate = (id: number) => request<null>(`${BASE}/templates/${id}/`, { method: "DELETE" });

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
