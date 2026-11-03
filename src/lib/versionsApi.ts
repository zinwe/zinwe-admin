/** New version tab: the weekly plans drafted from feedback and issue reports (/api/admin/versions/). */
import { ApiError, request } from "./api";
import { clearToken, getToken } from "./session";

export type PlanStatus = "drafting" | "ready" | "approved" | "set_aside" | "failed";
export type PlanDecision = "in" | "review" | "planned" | "later";
export type PlanKind = "bug" | "feature" | "improvement";

export interface PlanItem {
  title: string;
  kind: PlanKind;
  decision: PlanDecision;
  why: string;
  sources: { type: "feedback" | "issue"; id: number }[];
}

export interface VersionPlan {
  id: number;
  kind: "weekly" | "manual";
  status: PlanStatus;
  status_label: string;
  period: string;
  period_start: string;
  period_end: string;
  version: string;
  headline: string;
  summary: string;
  items: PlanItem[];
  counts: { feedback?: number; issues?: number; average_rating?: number | null };
  drafted_by: string;
  error: string;
  emailed_to: string;
  email_status: string;
  emailed_at: string | null;
  decided_by: string;
  decided_at: string | null;
  created_at: string;
}

export interface VersionPlans {
  rows: VersionPlan[];
  next_run: string;
}

export const listPlans = (): Promise<VersionPlans> => request<VersionPlans>("/api/admin/versions/");

/** Make a plan from the last 7 days now (Claude takes about a minute). */
export const makePlanNow = (): Promise<VersionPlan> => request<VersionPlan>("/api/admin/versions/", { method: "POST" });

export const decidePlan = (id: number, status: "approved" | "set_aside" | "ready"): Promise<VersionPlan> =>
  request<VersionPlan>(`/api/admin/versions/${id}/`, { method: "PATCH", body: JSON.stringify({ status }) });

/** Download a plan's PDF with the staff token. */
export async function downloadPlanPdf(id: number, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/admin/versions/${id}/pdf/`, { headers: token ? { Authorization: `Token ${token}` } : {} });
  if (res.status === 401) {
    clearToken();
    throw new ApiError("Your session has ended. Please sign in again.", 401);
  }
  if (!res.ok) throw new ApiError(`Couldn't download the PDF (${res.status}).`, res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
