/**
 * The step panel (board AdminWaCampaigns, "the step panel"): click a step on the path to change it here. Every change
 * is saved as you go by the builder; this panel only edits the step it is given.
 */
import { useState, type ReactElement } from "react";
import type { Audience } from "../../../../lib/marketingApi";
import type {
  WaCampaign, WaLane, WaPath, WaPathGoal, WaPathStep, WaScheduleRow, WaStepStats, WaTemplate, WaUnit,
} from "../../../../lib/whatsappApi";
import { CATEGORIES, CATEGORY_LABEL, trackName } from "../shared";
import { fillText, isWritten, parseBlocks } from "../templateBlocks";
import { band, isDraft, numbersOf, pathOrder, type Cat, type PreviewContact } from "../templateModel";
import {
  dateOf, dayOne, END_STATUS_LABEL, fmtDay, freshId, hours, LANE_NAME, parseDay, tplLabel, unitWord, type DayLabel,
} from "./pathModel";

export type Sel = { lane: WaLane; id: string } | { lane: "listen"; id: "listen" };
type PickCat = Cat | "older";

const QUICK: [number, WaUnit, string][] = [[1, "days", "1 day"], [2, "days", "2 days"], [3, "days", "3 days"], [1, "weeks", "1 week"], [30, "days", "30 days"]];

/** The text a template sends to this contact, in this language (its English when the Hinglish isn't written). */
export function textFor(t: WaTemplate, who: PreviewContact, lang: "en" | "hi"): { text: string; lang: "en" | "hi" } {
  const use = lang === "hi" && isWritten(t.text_hi) ? "hi" : "en";
  return { text: fillText(parseBlocks((use === "hi" ? t.text_hi : t.text) ?? ""), who.who, use), lang: use };
}

/** Templates that can go on a path: campaign templates and older ones, never archived or a version B. */
export const usable = (templates: WaTemplate[]): WaTemplate[] => templates.filter((t) => t.id && !t.archived && !t.version_of);

export function StepPanel(props: {
  sel: Sel;
  path: WaPath;
  camp: WaCampaign;
  templates: WaTemplate[];
  audiences: Audience[];
  who: PreviewContact;
  campLang: "en" | "hi";
  stats: Record<string, WaStepStats>;
  labels: Record<WaLane, Record<string, DayLabel>>;
  schedule: WaScheduleRow[] | null;
  dirty: boolean;
  readOnly: boolean;
  contactsIn: number;
  repliesSorted: number;
  onStep: (lane: WaLane, id: string, patch: Partial<WaPathStep>) => void;
  onLane: (lane: WaLane, list: WaPathStep[], toast?: string) => void;
  onRemove: () => void;
  onCamp: (patch: Partial<WaCampaign>) => void;
  onAddContacts: () => void;
  onClose: () => void;
}): ReactElement | null {
  const { sel, path, camp, templates, who, stats, labels, readOnly } = props;
  const [pickCat, setPickCat] = useState<PickCat | null>(null);
  const [prevLang, setPrevLang] = useState<"en" | "hi" | null>(null);
  const live = camp.status === "live";
  const note = readOnly ? "Ended: read only." : live ? "Saved as you go. Applies to people who haven’t reached it." : "Saved as you go.";

  let kicker = "REPLY PATHS";
  let title = "When they reply";
  let body: ReactElement;
  let canRemove = false;

  if (sel.lane === "listen") {
    body = (
      <>
        <div className="wf-box"><b>Claude reads every reply and suggests one of these.</b>You see it on Today and confirm with one click. Nothing moves without you.</div>
        <div className="wf-tl">
          <div><span>YES</span><span>Interested, wants to know more, asks for the video or the price</span></div>
          <div><span>Not now</span><span>Busy, later, after the season, ask next month</span></div>
          <div><span>STOP</span><span>STOP, band karo, mat bhejo, not interested. Ends every campaign for that number.</span></div>
          <div><span>A question</span><span>Answer it from Quick replies on Today. They stay where they are on the path.</span></div>
        </div>
        <span className="wf-help">{props.repliesSorted ? `${props.repliesSorted} replies sorted so far in this campaign.` : "Every reply shows on Today first."}</span>
      </>
    );
  } else {
    const lane = sel.lane;
    const list = path.lanes[lane];
    const idx = list.findIndex((x) => x.id === sel.id);
    const s = list[idx];
    if (!s) return null;
    const upd = (patch: Partial<WaPathStep>) => props.onStep(lane, s.id, patch);
    const lab = labels[lane][s.id];
    const st = stats[s.id];
    kicker = s.k === "start" ? "START" : `${LANE_NAME[lane].toUpperCase()} · STEP ${idx + (lane === "main" ? 0 : 1)}`;
    canRemove = s.k !== "start" && !readOnly;
    const byId = new Map(templates.map((t) => [t.id, t]));

    if (s.k === "send") {
      const t = s.template ? byId.get(s.template) : undefined;
      const pool = usable(templates);
      const hasOlder = pool.some((x) => !x.category);
      const cat: PickCat = pickCat ?? (t ? ((t.category as Cat) || "older") : "outreach");
      const cats: PickCat[] = [...CATEGORIES, ...(hasOlder ? (["older"] as PickCat[]) : [])];
      const opts = pool.filter((x) => (cat === "older" ? !x.category : x.category === cat)).sort((a, b) => pathOrder(a) - pathOrder(b));
      const lang = prevLang ?? props.campLang;
      const shown = t && !isDraft(t) ? textFor(t, who, lang) : null;
      title = t ? tplLabel(t) : "Send a template";
      body = (
        <>
          <div className="wf-col-f">
            <span className="wf-lbl">Template</span>
            <div className="wf-cats" role="group" aria-label="Category">
              {cats.map((c) => <button key={c} type="button" aria-pressed={c === cat} onClick={() => setPickCat(c)}>{c === "older" ? "Older" : CATEGORY_LABEL[c]}</button>)}
            </div>
            <div className="wf-pick" role="listbox" aria-label="Templates">
              {opts.length ? opts.map((x) => {
                const n = numbersOf(x).total;
                const draft = isDraft(x);
                const quick = x.category === "quick_reply";
                return (
                  <button key={x.id} type="button" role="option" className="wf-opt" aria-selected={x.id === s.template} aria-pressed={x.id === s.template} disabled={readOnly} onClick={() => upd({ template: x.id ?? null })}>
                    <span>{x.name}<small>{[x.type_name || (x.category ? "" : x.kind), draft ? "draft" : "", n.sends ? `${n.sends} sent` : ""].filter(Boolean).join(" · ")}</small></span>
                    {draft ? <span className="wt-pill is-draft">Draft</span> : <span className={`wt-pct ${quick ? "is-none" : band(n.rate, n.sends)}`}>{n.sends && !quick ? `${n.rate} %` : "—"}</span>}
                  </button>
                );
              }) : <span className="wf-help wf-pad">No templates in this category yet. Write one in Templates.</span>}
            </div>
            <span className="wf-help">Templates are written in the Templates tab. A change there shows here too.</span>
          </div>
          {t && isDraft(t) ? <div className="wf-box is-warn"><b>This template is a draft.</b>Write its English and Hinglish in Templates before day 1. Until then this step is skipped and the wait goes on.</div> : null}
          {shown && t ? (
            <div className="wf-col-f">
              <div className="wf-rowh">
                <span className="wf-lbl">How {who.title} reads it</span>
                <div className="wt-tabs" role="group" aria-label="Preview language">
                  {(["en", "hi"] as const).map((l) => <button key={l} type="button" aria-pressed={lang === l} onClick={() => setPrevLang(l)}>{l === "en" ? "English" : "Hinglish"}</button>)}
                </div>
              </div>
              <div className="wf-phone">
                <div className="wf-phonebar"><span className="wt-av" aria-hidden="true">{who.initials}</span><span><b>{who.title}</b>{who.who.Business} · {shown.lang === "en" ? "English" : "Hinglish"}{lab ? ` · ${lab.day}` : ""}</span></div>
                <div className="wf-phonebody"><div className="wt-bubble">{shown.text}<span className="wt-time">10:14 ✓✓</span></div></div>
              </div>
              {lang === "hi" && shown.lang === "en" ? <span className="wf-help">The Hinglish isn’t written yet, so this shows the English.</span> : null}
            </div>
          ) : null}
          <label className="wt-f">Send it
            <select value={s.only_if ?? ""} disabled={readOnly} onChange={(e) => upd({ only_if: e.target.value as "" | "no_pc" })}>
              <option value="">Always</option>
              <option value="no_pc">Only if they have no PC set up yet</option>
            </select>
            <small>The campaign’s language decides English or Hinglish for each contact.</small>
          </label>
          {st && st.sent > 0 ? (
            <div className="wf-perf">
              <span className="wf-lbl">This step so far</span>
              <div><span>Sent</span><b>{st.sent}</b></div>
              <div><span>Replied</span><b>{st.replies} · {st.reply_rate} %</b></div>
              <div className="wt-bar"><i className={band(st.reply_rate, st.sent)} style={{ width: `${st.reply_rate}%` }} /></div>
            </div>
          ) : null}
        </>
      );
    } else if (s.k === "wait") {
      const n = s.n ?? 1;
      const before = list.slice(0, idx).reverse().find((x) => x.k === "send" || x.k === "group");
      const after = list.slice(idx + 1).find((x) => x.k === "send" || x.k === "group");
      const nm = (x: WaPathStep | undefined) => (!x ? "the next step" : x.k === "group" ? (x.category === "demo_video" ? "the next Demo video" : "the next Intro message") : tplLabel(x.template ? byId.get(x.template) : undefined));
      let tl: { d: string; t: string; on?: boolean }[];
      const blab = before ? labels.main[before.id] : undefined;
      if (lane === "main" && before && blab) {
        const d0 = before.k === "group" ? blab.last ?? blab.d ?? 1 : blab.d ?? 1;
        const d1 = d0 + Math.floor(hours(s) / 24);
        const rows = props.schedule ?? [];
        const rb = rows.filter((r) => r.step_id === before.id).pop();
        const ra = after ? rows.find((r) => r.step_id === after.id) : undefined;
        let a: string; let b: string; let movedFrom = ""; let dayB = d1;
        // The server's real dates, while they still match this path (a Sunday move adds a day); else work them out here.
        if (!props.dirty && rb && ra && (ra.day === d1 || ra.day === d1 + 1)) {
          a = fmtDay(parseDay(rb.date));
          b = fmtDay(parseDay(ra.date));
          dayB = ra.day;
          movedFrom = ra.moved_from ?? "";
        } else {
          const start = dayOne(props.schedule);
          a = dateOf(start, d0, false).text;
          const x = dateOf(start, d1, !!s.window);
          b = x.text;
          dayB = x.day;
          movedFrom = x.moved ? "Sunday" : "";
        }
        tl = [
          { d: a, t: `Gets ${nm(before)} (day ${d0})` },
          { d: `+ ${n} ${unitWord(n, s.unit)}`, t: "Waits here" },
          { d: b, t: `${after ? `Gets ${nm(after)}` : "Goes on"} (day ${dayB})${movedFrom ? `, moved from ${movedFrom}` : ""}`, on: true },
        ];
      } else {
        tl = [
          { d: lane === "main" ? "Start" : "Reply", t: lane === "main" ? "They join the campaign" : `They said ${lane === "yes" ? "YES" : lane === "notnow" ? "not now" : "STOP"}` },
          { d: `+ ${n} ${unitWord(n, s.unit)}`, t: "Waits here" },
          { d: "Then", t: `Gets ${nm(after)}${s.window ? ", in the next Mon–Sat slot" : ""}`, on: true },
        ];
      }
      title = `Wait ${n} ${unitWord(n, s.unit)}`;
      body = (
        <>
          <div className="wf-col-f">
            <label className="wf-lbl" htmlFor="wf-wait-n">Wait for</label>
            <div className="wf-dur">
              <input id="wf-wait-n" type="number" min={1} max={90} value={n} disabled={readOnly} onChange={(e) => upd({ n: Math.max(1, Math.min(90, parseInt(e.target.value, 10) || 1)) })} />
              <select value={s.unit ?? "days"} aria-label="Unit" disabled={readOnly} onChange={(e) => upd({ unit: e.target.value as WaUnit })}>
                <option value="hours">hours</option><option value="days">days</option><option value="weeks">weeks</option>
              </select>
            </div>
            <div className="wf-quick">
              {QUICK.map(([qn, qu, l]) => <button key={l} type="button" disabled={readOnly} aria-pressed={n === qn && (s.unit ?? "days") === qu} onClick={() => upd({ n: qn, unit: qu })}>{l}</button>)}
            </div>
          </div>
          <label className="wf-chk"><input type="checkbox" checked={!!s.window} disabled={readOnly} onChange={(e) => upd({ window: e.target.checked })} /><span>Send only Mon–Sat, 10:00–19:00. A message that falls outside waits for the next slot.</span></label>
          <div className="wf-col-f">
            <span className="wf-lbl">What it means for {who.title}</span>
            <div className="wf-tl">{tl.map((x) => <div key={x.t} className={x.on ? "is-on" : undefined}><span>{x.d}</span><span>{x.t}</span></div>)}</div>
          </div>
          <div className="wf-box">Changing the wait moves every later step. People already waiting here keep the date they had.</div>
        </>
      );
    } else if (s.k === "reply") {
      title = "Wait for their answer";
      body = (
        <>
          <div className="wf-col-f">
            <label className="wf-lbl" htmlFor="wf-reply-n">Wait for their answer, up to</label>
            <div className="wf-dur">
              <input id="wf-reply-n" type="number" min={1} max={14} value={s.n ?? 1} disabled={readOnly} onChange={(e) => upd({ n: Math.max(1, Math.min(14, parseInt(e.target.value, 10) || 1)) })} />
              <select value={s.unit === "hours" ? "hours" : "days"} aria-label="Unit" disabled={readOnly} onChange={(e) => upd({ unit: e.target.value as WaUnit })}>
                <option value="hours">hours</option><option value="days">days</option>
              </select>
            </div>
          </div>
          <div className="wf-box">When they answer, they go on at once. With no answer by then, they go on to the next step anyway.</div>
        </>
      );
    } else if (s.k === "track") {
      title = "Set the Track";
      body = (
        <>
          <div className="wf-box"><b>The Track decides which videos and offer they get.</b>Data Privacy, Team Activity Monitoring or Both Pack. Until it is set the contact is Unassigned and gets no Demo video.</div>
          <div className="wf-box">You set it on Today after their answers; Claude suggests one from their words. They go on once it is set.</div>
        </>
      );
    } else if (s.k === "start") {
      title = "Who enters, and how it sends";
      body = (
        <>
          <label className="wt-f">Campaign name<input type="text" maxLength={120} value={camp.name} disabled={readOnly} onChange={(e) => props.onCamp({ name: e.target.value })} /></label>
          <label className="wt-f">Who enters
            <select value={camp.audience ?? 0} disabled={readOnly} onChange={(e) => props.onCamp({ audience: Number(e.target.value) || null })}>
              <option value={0}>Contacts you add to it</option>
              {props.audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <small>Only opted-in numbers enter. Someone in another live campaign is skipped.</small>
          </label>
          <div className="wt-grid2">
            <label className="wt-f">Language
              <select value={camp.language ?? "en"} disabled={readOnly} onChange={(e) => props.onCamp({ language: e.target.value as WaCampaign["language"] })}>
                <option value="hi">Hinglish first</option>
                <option value="en">English</option>
                <option value="ab">Half and half (to compare)</option>
              </select>
            </label>
            <label className="wt-f">New people a day
              <input type="number" min={1} max={100} value={camp.daily_limit} disabled={readOnly} onChange={(e) => props.onCamp({ daily_limit: Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)) })} />
              <small>Replies and the YES path have no limit.</small>
            </label>
          </div>
          <label className="wf-chk"><input type="checkbox" checked disabled /><span>Stop for good on STOP, band karo or mat bhejo, in every campaign. Always on.</span></label>
          <div className="wf-rowh">
            <span className="wf-help">{props.contactsIn ? `${props.contactsIn} contacts in this campaign.` : "No contacts yet."} Sends go Mon–Sat, India time.</span>
            {readOnly ? null : <button type="button" className="wt-btn" onClick={props.onAddContacts}>Add contacts</button>}
          </div>
        </>
      );
    } else if (s.k === "group") {
      const cat = s.category === "demo_video" ? "demo_video" : "outreach";
      const count = s.count ?? 1;
      const every = s.every ?? 1;
      const used = new Set(Object.values(path.lanes).flat().filter((x) => x.k === "send").map((x) => x.template));
      let pool = usable(templates).filter((t) => t.category === cat && !used.has(t.id ?? null)).sort((a, b) => pathOrder(a) - pathOrder(b));
      const track = cat === "demo_video" ? pool[0]?.track : undefined;
      if (cat === "demo_video") pool = pool.filter((t) => t.track === track);
      const items = Array.from({ length: count }, (_, j) => ({ j, t: pool[j] }));
      const word = cat === "outreach" ? "Intro messages" : "Demo videos";
      title = `${count} more ${word}`;
      const unfold = () => {
        const out: WaPathStep[] = [];
        const probe: WaPath = { v: 1, lanes: { ...path.lanes } };
        const mk = (x: Omit<WaPathStep, "id">): WaPathStep => {
          const step = { ...x, id: freshId(probe, lane) } as WaPathStep;
          probe.lanes[lane] = [...probe.lanes[lane], step];
          return step;
        };
        items.forEach(({ t }) => {
          out.push(mk({ k: "wait", n: every, unit: "days", window: true }));
          out.push(mk({ k: "send", template: t?.id ?? null, only_if: "" }));
        });
        props.onLane(lane, [...list.slice(0, idx), ...out, ...list.slice(idx + 1)], `Shown as ${count} steps. Each one can now be changed or removed.`);
      };
      body = (
        <>
          <div className="wt-grid2">
            <label className="wt-f">Messages<input type="number" min={1} max={60} value={count} disabled={readOnly} onChange={(e) => upd({ count: Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)) })} /></label>
            <label className="wt-f">One every<select value={every} disabled={readOnly} onChange={(e) => upd({ every: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 7, 14].map((d) => <option key={d} value={d}>{d === 1 ? "day" : `${d} days`}</option>)}
            </select></label>
          </div>
          <div className="wf-box">{cat === "outreach"
            ? `The next Intro templates nobody on this path has had yet, in their day order, one every ${every === 1 ? "day" : `${every} days`}. Change the order or a message in Templates, or show them as steps here to change one.`
            : `The rest of the contact’s Track videos, one every ${every === 1 ? "day" : `${every} days`}.${track ? ` Shown for ${trackName(track)}; each contact gets their own Track’s.` : ""}`}</div>
          <div className="wf-list">
            {items.map(({ j, t }) => {
              const n = t ? numbersOf(t).total : null;
              return (
                <div key={j}>
                  <span>{lane === "main" && lab?.d ? `Day ${lab.d + j * every}` : j ? `+${j * every} d` : "First"}</span>
                  <span>{t ? tplLabel(t) : "No template yet: write one in Templates"}</span>
                  {t && isDraft(t) ? <span className="wt-pill is-draft">Draft</span> : <span className={`wt-pct ${n ? band(n.rate, n.sends) : "is-none"}`}>{n && n.sends ? `${n.rate} %` : "—"}</span>}
                </div>
              );
            })}
          </div>
          {readOnly ? null : <button type="button" className="wt-btn wf-self" onClick={unfold}>Show them as steps</button>}
        </>
      );
    } else if (s.k === "goal") {
      title = "Goal";
      body = (
        <>
          <label className="wt-f">The goal is reached when
            <select value={s.goal ?? "paid"} disabled={readOnly} onChange={(e) => upd({ goal: e.target.value as WaPathGoal })}>
              <option value="paid">They pay for a plan</option>
              <option value="first_pc">Their first PC is set up</option>
              <option value="signup">They sign up</option>
              <option value="yes">They say YES</option>
            </select>
            <small>They wait here until it happens, then go on. Analytics counts it per campaign.</small>
          </label>
          <div className="wf-box">{st?.sent ? `${st.sent} people reached it in this campaign.` : "Nobody has reached it yet."}{s.goal === "paid" ? " Their testimonial request still goes 14 days after the first PC." : ""}</div>
        </>
      );
    } else if (s.k === "goto") {
      const targets: [string, string][] = [["main:resume", "The Intro messages, at the next one they haven’t had"]];
      (["yes", "notnow", "main"] as WaLane[]).forEach((l) => {
        const first = path.lanes[l].find((x) => x.k !== "start");
        if (first && first.id !== s.id) targets.push([`${l}:${first.id}`, `The start of the ${LANE_NAME[l]}`]);
      });
      (["main", "yes", "notnow", "stop"] as WaLane[]).forEach((l) => path.lanes[l].forEach((x) => {
        if ((x.k === "send" || x.k === "group") && !targets.some(([v]) => v === `${l}:${x.id}`)) {
          const lb = labels[l][x.id];
          targets.push([`${l}:${x.id}`, `${LANE_NAME[l]} · ${lb ? `${lb.day} · ` : ""}${x.k === "group" ? `${x.count ?? 0} more messages` : tplLabel(x.template ? byId.get(x.template) : undefined)}`]);
        }
      }));
      const value = `${s.lane ?? "main"}:${s.step ?? "resume"}`;
      if (!targets.some(([v]) => v === value)) targets.push([value, "A step that isn’t there any more: pick another"]);
      title = "Go to";
      body = (
        <>
          <label className="wt-f">Go to
            <select value={value} disabled={readOnly} onChange={(e) => { const [l, id] = e.target.value.split(":"); upd({ lane: l as WaLane, step: id }); }}>
              {targets.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <div className="wf-box">Nobody gets the same template twice in one campaign.</div>
        </>
      );
    } else {
      title = s.label || "Ends here";
      body = (
        <>
          <label className="wt-f">Label<input type="text" maxLength={80} value={s.label ?? ""} disabled={readOnly} onChange={(e) => upd({ label: e.target.value })} placeholder="No reply by day 90" /></label>
          <label className="wt-f">They leave as
            <select value={s.status ?? "done"} disabled={readOnly} onChange={(e) => upd({ status: e.target.value as WaPathStep["status"] })}>
              {Object.entries(END_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="wt-f">Note for staff<input type="text" maxLength={200} value={s.note ?? ""} disabled={readOnly} onChange={(e) => upd({ note: e.target.value })} placeholder="They leave this campaign." /></label>
          <div className="wf-box">{s.note || "They leave this campaign."}</div>
        </>
      );
    }
  }

  return (
    <aside className="wf-drawer" role="dialog" aria-label={title}>
      <div className="wf-drawin">
        <div className="wf-dh"><div><small>{kicker}</small><h3>{title}</h3></div><button type="button" className="wf-x" aria-label="Close" onClick={props.onClose}>×</button></div>
        <div className="wf-db">{body}</div>
        <div className="wf-df">
          <button type="button" className="wt-btn is-dark" onClick={props.onClose}>Done</button>
          {canRemove ? <button type="button" className="wf-danger" onClick={props.onRemove}>Remove step</button> : null}
          <span className="wf-note">{note}</span>
        </div>
      </div>
    </aside>
  );
}

