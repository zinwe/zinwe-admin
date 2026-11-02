/** Typed client for /api/admin/marketing/*: personas, target audiences and outreach campaigns. */
import { ApiError, request } from "./api";
import { getToken } from "./session";

const BASE = "/api/admin/marketing";

export type Confidence = "Guess" | "Heard once" | "Confirmed";

/** One section of a persona: form sections hold label -> text, table sections hold rows. */
export type ProfileForm = Record<string, string>;
export type ProfileRow = Record<string, string>;
export type PersonaProfile = Record<string, ProfileForm | ProfileRow[]>;

export interface Persona {
  id?: number;
  name: string;
  confidence: Confidence;
  profile: PersonaProfile;
  audience_count?: number;
  updated_at?: string;
}

export type BusinessType = "B2B" | "B2C" | "Both";
export type Objective = "Leads" | "Sales" | "Enquiries" | "Brand Awareness";

export interface Audience {
  id?: number;
  persona: number;
  name: string;
  country: string;
  state: string;
  city: string;
  business_category: string;
  business_segment: string;
  business_type: BusinessType;
  primary_problem: string;
  secondary_problem: string;
  product_service: string;
  how_solves: string;
  key_benefits: string[];
  primary_offer: string;
  pricing: string;
  objective: Objective;
  cta: string;
  job_titles: string[];
  decision_makers: string[];
  industry_keywords: string[];
  competitors: string[];
  notes: string;
  channels: string[];
  campaign_count?: number;
}

export type ChipKey = "key_benefits" | "job_titles" | "decision_makers" | "industry_keywords" | "competitors";

export interface Sender {
  from: string;
  reply_to: string;
  domain: string;
  mailbox_ready: boolean;
  smtp_host: string;
  newsletter_from: string;
  postal_address: string;
  limits: number[];
  patterns: PatternChoice[];
}

export interface PatternChoice {
  key: string;
  name: string;
  text: string;
  emails: number;
}

export interface CampaignCounts {
  total: number;
  due: number;
  waiting: number;
  paused: number;
  cold: number;
  opted: number;
  blocked: number;
  failed: number;
  needs_you: number;
}

export interface CampaignSummary {
  id: number;
  name: string;
  audience: number;
  audience_name: string;
  goal: string;
  theme: string;
  status: "draft" | "active" | "paused";
  counts: CampaignCounts;
  pattern: string;
  emails_count: number;
  ready_today: number;
  emailed: number;
  replied: number;
  signed_up: number;
}

export interface EmailStep {
  n: number;
  stage: string;
  when: string;
  week: number;
  subject: string;
  body: string;
  template_name: string;
}

export type TemplateKind = "Cold" | "Setup" | "Tips" | "Final";

export interface EmailTemplate {
  id?: number;
  name: string;
  kind: TemplateKind;
  subject: string;
  body: string;
  built_in?: boolean;
  used_in?: number;
}

export interface LaunchCheck {
  key: string;
  label: string;
  done: boolean;
}

export interface CampaignReport {
  funnel: { label: string; value: number }[];
  by_email: { n: number; subject: string; stage: string; sent: number; replies: number }[];
  reply_rate: number;
  health: { bounce_rate: number; unsubscribe_rate: number; complaints: number };
}

export interface CampaignDetail extends CampaignSummary {
  problem: string;
  offer: string;
  pause_reason: string;
  daily_limit: number;
  sent_today: number;
  pattern_open: boolean;
  emails_read_at: string | null;
  persona: number;
  dns_result: { spf?: boolean; dkim?: boolean; dmarc?: boolean };
  dns_checked_at: string | null;
  rules_checked_at: string | null;
  rules_checked_by: string;
  test_sent_at: string | null;
  checks: LaunchCheck[];
  report: CampaignReport;
  emails: EmailStep[];
}

export type ContactStatus = "new" | "cold" | "waiting" | "opted" | "signed" | "paused" | "snoozed" | "closed" | "finished" | "suppressed";

export interface Contact {
  id: number;
  first_name: string;
  firm: string;
  email: string;
  city: string;
  status: ContactStatus;
  stage: string;
  next_email: number;
  next_date: string | null;
  last_email: number;
  opted_in_at: string | null;
  proof: string;
  installed: boolean;
  reason: string;
  events: { at: string; text: string }[];
}

export interface ImportResult {
  line: string;
  result: "good" | "warn" | "bad";
  message: string;
}

export interface FileRow {
  row: number;
  first_name: string;
  firm: string;
  email: string;
  city: string;
  result: "ready" | "good" | "warn" | "bad";
  message: string;
}

export interface Blocked {
  email: string;
  reason: string;
  created_at: string;
}

const json = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

export const getPersonas = () => request<Persona[]>(`${BASE}/personas/`);
export const getPersona = (id: number) => request<Persona>(`${BASE}/personas/${id}/`);
export const savePersona = (p: Persona) =>
  p.id
    ? request<Persona>(`${BASE}/personas/${p.id}/`, { method: "PUT", body: JSON.stringify(p) })
    : request<Persona>(`${BASE}/personas/`, json(p));
export const deletePersona = (id: number) => request<null>(`${BASE}/personas/${id}/`, { method: "DELETE" });

export const getAudiences = (persona?: number) => request<Audience[]>(`${BASE}/audiences/${persona ? `?persona=${persona}` : ""}`);
export const getAudience = (id: number) => request<Audience>(`${BASE}/audiences/${id}/`);
export const saveAudience = (a: Audience) =>
  a.id
    ? request<Audience>(`${BASE}/audiences/${a.id}/`, { method: "PUT", body: JSON.stringify(a) })
    : request<Audience>(`${BASE}/audiences/`, json(a));
export const deleteAudience = (id: number) => request<null>(`${BASE}/audiences/${id}/`, { method: "DELETE" });

export const getCampaigns = () => request<{ sender: Sender; campaigns: CampaignSummary[] }>(`${BASE}/campaigns/`);
export const getCampaign = (id: number) => request<CampaignDetail>(`${BASE}/campaigns/${id}/`);
export const createCampaign = (body: { name: string; audience: number; pattern?: string; copy_from?: number }) => request<CampaignDetail>(`${BASE}/campaigns/`, json(body));
export const patchCampaign = (id: number, patch: Partial<Pick<CampaignDetail, "name" | "goal" | "theme" | "problem" | "offer" | "daily_limit"> & { audience: number }>) =>
  request<CampaignDetail>(`${BASE}/campaigns/${id}/`, { method: "PATCH", body: JSON.stringify(patch) });
export const deleteCampaign = (id: number) => request<null>(`${BASE}/campaigns/${id}/`, { method: "DELETE" });
export const campaignAction = (id: number, action: "launch" | "pause" | "test" | "dns" | "rules" | "emails-read" | "send", body: object = {}) =>
  request<CampaignDetail>(`${BASE}/campaigns/${id}/${action}/`, json(body));
export const saveEmail = (id: number, n: number, subject: string, body: string) =>
  request<EmailStep>(`${BASE}/campaigns/${id}/emails/${n}/`, { method: "PUT", body: JSON.stringify({ subject, body }) });

export const addEmail = (id: number, template?: number) => request<CampaignDetail>(`${BASE}/campaigns/${id}/emails/`, json({ template }));
export const useTemplate = (id: number, n: number, template: number) => request<CampaignDetail>(`${BASE}/campaigns/${id}/emails/${n}/use-template/`, json({ template }));
export const saveAsTemplate = (id: number, n: number, name: string) => request<EmailTemplate>(`${BASE}/campaigns/${id}/emails/${n}/save-template/`, json({ name }));

export const getTemplates = () => request<EmailTemplate[]>(`${BASE}/templates/`);
export const saveTemplate = (t: EmailTemplate) =>
  t.id
    ? request<EmailTemplate>(`${BASE}/templates/${t.id}/`, { method: "PUT", body: JSON.stringify(t) })
    : request<EmailTemplate>(`${BASE}/templates/`, json(t));
export const deleteTemplate = (id: number) => request<null>(`${BASE}/templates/${id}/`, { method: "DELETE" });
export const removeEmail = (id: number, n: number) => request<CampaignDetail>(`${BASE}/campaigns/${id}/emails/${n}/`, { method: "DELETE" });

export const getContacts = (id: number) => request<Contact[]>(`${BASE}/campaigns/${id}/contacts/`);
export const importContacts = (id: number, text: string) => request<{ results: ImportResult[] }>(`${BASE}/campaigns/${id}/contacts/import/`, json({ text }));
export const actOnContact = (id: number, action: string, note = "") => request<Contact>(`${BASE}/contacts/${id}/act/`, json({ action, note }));
export const getBlocked = () => request<Blocked[]>(`${BASE}/blocked/`);

function fileBody(file: File, add: boolean): FormData {
  const body = new FormData();
  body.append("file", file);
  if (add) body.append("add", "1");
  return body;
}
export const reviewContactFile = (id: number, file: File) => request<{ rows: FileRow[] }>(`${BASE}/campaigns/${id}/contacts/upload/`, { method: "POST", body: fileBody(file, false) });
export const addContactFile = (id: number, file: File) => request<{ added: number }>(`${BASE}/campaigns/${id}/contacts/upload/`, { method: "POST", body: fileBody(file, true) });

/** Saves the blank Excel template. */
export async function downloadContactTemplate(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}/contact-template/`, { headers: token ? { Authorization: `Token ${token}` } : {} });
  if (!res.ok) throw new ApiError(`Couldn't download the template (${res.status}).`, res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = "zinwe-contacts-template.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
