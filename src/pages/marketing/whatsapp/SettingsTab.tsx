/**
 * Marketing -> WhatsApp -> Settings (wa4, 12 Nov 2026), from the approved Settings board: the rules every campaign
 * follows, as settings staff change and save. The sections on the left (each with a one-line summary), the selected
 * one as rows (label and help on the left, the control on the right), one Save for all of them. Live campaigns follow
 * a saved change from their next send (z_marketing/wa_settings.py). Rules that never change show as read-only rows.
 */
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../../../components/States";
import { useToast } from "../../../components/Toast";
import { ApiError } from "../../../lib/api";
import { getWaSettings, saveWaSettings, WA_SLOTS, type WaSettings, type WaSettingsInput, type WaSlot } from "../../../lib/whatsappApi.settings";
import { errText, SideItem, WtShell } from "./shared";
import "../../../styles/wa-settings.css";

type Sec = "window" | "limits" | "slots" | "stop" | "lang" | "claude" | "number" | "offers";
const SECS: [Sec, string, string][] = [
  ["window", "Days and hours", "When messages may go out. Replies can be answered any time."],
  ["limits", "Daily limits", "How much one number sends, so WhatsApp keeps trusting it."],
  ["slots", "Send slots", "The four windows Today groups sends into."],
  ["stop", "STOP and opt-in", "Who may be messaged, and how a person stops it."],
  ["lang", "Language", "Which language a campaign starts in."],
  ["claude", "Claude", "What Claude does on Today. It never sends."],
  ["number", "WhatsApp number", "The number every message leaves from."],
  ["offers", "Offers and coupons", "What an Offer step may promise."],
];
/** Which settings each section holds, to mark a section with something to fix. */
const FIELDS: Record<Sec, (keyof WaSettingsInput)[]> = {
  window: ["send_days", "send_from", "send_to", "skip_holidays"],
  limits: ["new_per_day", "per_number_day", "per_person_day", "min_intro_wait", "max_days"],
  slots: ["slots"],
  stop: ["stop_words", "stop_pause_pct"],
  lang: ["language"],
  claude: ["claude_read", "claude_draft", "claude_track"],
  number: ["wa_number", "wa_name"],
  offers: ["discount_max"],
};
/** Monday first; the server counts Monday as 0. */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOT_TEXT: Record<WaSlot, [string, string]> = {
  "10-12": ["10–12", "Most sends. People are at their desks."],
  "12-14": ["12–14", "Lunch."],
  "14-17": ["14–17", "Afternoon."],
  "17-19": ["17–19", "Evening. Fast replies."],
};
const LANG_TEXT: Record<WaSettings["language"], string> = { hi: "Hinglish first", en: "English", ab: "Half and half, to compare" };
const SAVED = "Saved just now. Live campaigns follow it from the next send.";

/** "Mon–Sat" for a run of days, else "Mon, Wed, Fri". */
function daysText(days: number[]): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (!d.length) return "No days";
  if (d.length === 7) return "Every day";
  const run = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return run && d.length > 2 ? `${DAYS[d[0]]}–${DAYS[d[d.length - 1]]}` : d.map((x) => DAYS[x]).join(", ");
}
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const toMin = (t: string): number => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
/** A slot is used only while it sits inside the hours. */
const inHours = (slot: WaSlot, s: WaSettingsInput): boolean => {
  const [a, b] = slot.split("-").map((x) => Number(x) * 60);
  return a < toMin(s.send_to) && b > toMin(s.send_from);
};

function lastSaved(s: WaSettings): string {
  if (!s.updated_at) return "Using the standard rules. Nothing changed yet.";
  const d = new Date(s.updated_at);
  const day = `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`;
  const who = s.updated_by.split("@")[0].split(" ")[0];
  return `Last saved ${day}${who ? ` by ${who}` : ""}.`;
}

function summary(k: Sec, s: WaSettingsInput): string {
  switch (k) {
    case "window": return `${daysText(s.send_days)}, ${s.send_from}–${s.send_to}`;
    case "limits": return `${s.new_per_day} new people a day`;
    case "slots": {
      const on = WA_SLOTS.filter((x) => s.slots.includes(x) && inHours(x, s));
      return on.length ? `${plural(on.length, "slot", "slots")} · ${SLOT_TEXT[on[0]][0]} first` : "No slot in the hours";
    }
    case "stop": return plural(s.stop_words.length, "stop word", "stop words");
    case "lang": return LANG_TEXT[s.language];
    case "claude": {
      const does = [s.claude_read && "reads replies", s.claude_draft && "drafts answers", s.claude_track && "suggests the Track"].filter(Boolean) as string[];
      if (!does.length) return "Off. It never sends";
      const text = does.slice(0, 2).join(", ");
      return text[0].toUpperCase() + text.slice(1);
    }
    case "number": return s.wa_number || "Number not added";
    case "offers": return `Up to ${s.discount_max} % off`;
  }
}

function Row({ label, help, err, tight, children }: { label: string; help: ReactNode; err?: string; tight?: boolean; children: ReactNode }): ReactElement {
  return (
    <div className={"wsx-row" + (tight ? " is-tight" : "") + (err ? " is-err" : "")}>
      <span className="wsx-l">{label}<small>{help}</small>{err ? <em className="wsx-err" role="alert">{err}</em> : null}</span>
      <div className="wsx-ctl">{children}</div>
    </div>
  );
}

function Toggle({ on, label, onFlip }: { on: boolean; label: string; onFlip?: () => void }): ReactElement {
  return <button type="button" className="wsx-tog" role="switch" aria-checked={on} aria-label={label} disabled={!onFlip} onClick={onFlip} />;
}

const strip = (s: WaSettings): WaSettingsInput => {
  const { updated_at: _a, updated_by: _b, ...rest } = s;
  return rest;
};

export function SettingsTab(): ReactElement {
  const toast = useToast();
  const [sec, setSec] = useState<Sec>("window");
  const [saved, setSaved] = useState<WaSettings | null | undefined>(undefined);
  const [draft, setDraft] = useState<WaSettingsInput | null>(null);
  const [failed, setFailed] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [word, setWord] = useState("");

  const load = () => {
    setFailed("");
    getWaSettings().then((s) => { setSaved(s); setDraft(s ? strip(s) : null); }).catch((err) => setFailed(errText(err, "Couldn't load the settings.")));
  };
  useEffect(load, []);

  const dirty = useMemo(() => !!saved && !!draft && JSON.stringify(strip(saved)) !== JSON.stringify(draft), [saved, draft]);
  const [title, desc] = (SECS.find((x) => x[0] === sec) ?? SECS[0]).slice(1) as [string, string];

  const side = (close: () => void) => (
    <div className="wt-sec">
      {SECS.map(([k, label]) => (
        <SideItem key={k} on={sec === k} onPick={() => { setSec(k); close(); }} label={label} sub={draft ? summary(k, draft) : undefined}
          chip={FIELDS[k].some((f) => errors[f]) ? <span className="wt-pct is-low">Fix</span> : null} />
      ))}
    </div>
  );

  if (failed || saved === null || saved === undefined || !draft) {
    return (
      <WtShell label="Settings sections" current={title} side={side}>
        <div className="wt-head"><div><h2>{title}</h2><p>{desc}</p></div></div>
        <div className="wtx-pad">
          {failed ? <ErrorState message={failed} onRetry={load} />
            : saved === null ? <ErrorState title="Settings aren’t on this server yet" message="This server still has the fixed rules. Settings come with the next update." />
              : <LoadingState rows={5} />}
        </div>
      </WtShell>
    );
  }

  const set = (patch: Partial<WaSettingsInput>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setJustSaved(false);
    const touched = Object.keys(patch);
    if (touched.some((k) => errors[k])) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !touched.includes(k))));
  };
  const num = (key: "new_per_day" | "per_number_day", v: string) => set({ [key]: v === "" ? 0 : Math.max(0, Math.trunc(Number(v))) } as Partial<WaSettingsInput>);
  const addWord = () => {
    const w = word.trim().replace(/\s+/g, " ");
    if (!w) return;
    if (!draft.stop_words.some((x) => x.toLowerCase() === w.toLowerCase())) set({ stop_words: [...draft.stop_words, w] });
    setWord("");
  };
  const save = async () => {
    setBusy(true);
    try {
      const s = await saveWaSettings(draft);
      setSaved(s);
      setDraft(strip(s));
      setErrors({});
      setJustSaved(true);
      toast("Saved. Live campaigns follow it from the next send.");
    } catch (err) {
      const fields = err instanceof ApiError ? err.fields : {};
      setErrors(fields);
      const first = SECS.find(([k]) => FIELDS[k].some((f) => fields[f]));
      if (first && !FIELDS[sec].some((f) => fields[f])) setSec(first[0]);
      toast(Object.keys(fields).length ? "Not saved. Check the settings marked Fix." : errText(err, "Couldn't save the settings."), "bad");
    }
    setBusy(false);
  };
  const undo = () => { setDraft(strip(saved)); setErrors({}); };
  const e = errors;

  let body: ReactElement;
  if (sec === "window") {
    body = (
      <div className="wsx-sec">
        <Row label="Days" help="Nothing is sent on the other days. Replies still show on Today." err={e.send_days}>
          <div className="wsx-days" role="group" aria-label="Days">
            {DAYS.map((d, i) => (
              <button key={d} type="button" aria-pressed={draft.send_days.includes(i)}
                onClick={() => set({ send_days: draft.send_days.includes(i) ? draft.send_days.filter((x) => x !== i) : [...draft.send_days, i].sort((a, b) => a - b) })}>{d}</button>
            ))}
          </div>
        </Row>
        <Row label="Hours" help="India time. A message that falls outside waits for the next opening." err={e.send_from || e.send_to}>
          <input type="time" value={draft.send_from} aria-label="From" onChange={(ev) => set({ send_from: ev.target.value })} />
          <span className="wsx-to">to</span>
          <input type="time" value={draft.send_to} aria-label="To" onChange={(ev) => set({ send_to: ev.target.value })} />
        </Row>
        <Row tight label="Skip public holidays" help="Diwali, Holi, 26 Jan, 15 Aug and 2 Oct. A message due that day goes on the next send day." err={e.skip_holidays}>
          <Toggle on={draft.skip_holidays} label="Skip public holidays" onFlip={() => set({ skip_holidays: !draft.skip_holidays })} />
        </Row>
      </div>
    );
  } else if (sec === "limits") {
    body = (
      <div className="wsx-sec">
        <Row tight label="New people a day" help="The default for a new campaign. Each campaign can set its own, lower or higher." err={e.new_per_day}>
          <input type="number" min={1} max={50} value={draft.new_per_day || ""} aria-label="New people a day" onChange={(ev) => num("new_per_day", ev.target.value)} />
        </Row>
        <Row tight label="Messages a day from this number" help="Intro messages from all campaigns together. Replies and the YES path don’t count. WhatsApp flags numbers that send too many to strangers." err={e.per_number_day}>
          <input type="number" min={1} max={500} value={draft.per_number_day || ""} aria-label="Messages a day from this number" onChange={(ev) => num("per_number_day", ev.target.value)} />
        </Row>
        <Row tight label="One person gets at most" help="Every message from this number counts, replies too." err={e.per_person_day}>
          <select value={draft.per_person_day} aria-label="Messages a day to one person" onChange={(ev) => set({ per_person_day: Number(ev.target.value) as 1 | 2 })}>
            <option value={1}>1 message a day</option><option value={2}>2 messages a day</option>
          </select>
        </Row>
        <Row tight label="Shortest wait between Intro messages" help="A campaign step can’t be shorter." err={e.min_intro_wait}>
          <select value={draft.min_intro_wait} aria-label="Shortest wait" onChange={(ev) => set({ min_intro_wait: Number(ev.target.value) as 1 | 2 | 3 })}>
            <option value={1}>1 day</option><option value={2}>2 days</option><option value={3}>3 days</option>
          </select>
        </Row>
        <Row tight label="Longest campaign" help="After this, someone who never replied is marked No reply." err={e.max_days}>
          <select value={draft.max_days} aria-label="Longest campaign" onChange={(ev) => set({ max_days: Number(ev.target.value) as 30 | 60 | 90 })}>
            <option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option>
          </select>
        </Row>
      </div>
    );
  } else if (sec === "slots") {
    body = (
      <div className="wsx-sec">
        <div className="wsx-sech"><p>Today lists what is due slot by slot. A slot outside the hours in Days and hours isn’t used.</p></div>
        {WA_SLOTS.map((k) => {
          const on = draft.slots.includes(k);
          const out = !inHours(k, draft);
          return (
            <div key={k} className={"wsx-slot" + (out ? " is-out" : "")}>
              <b>{SLOT_TEXT[k][0]}</b>
              <span>{out ? "Outside the hours." : SLOT_TEXT[k][1]}</span>
              <Toggle on={on && !out} label={`Use the ${SLOT_TEXT[k][0]} slot`} onFlip={out ? undefined : () => set({ slots: on ? draft.slots.filter((x) => x !== k) : WA_SLOTS.filter((x) => x === k || draft.slots.includes(x)) })} />
            </div>
          );
        })}
        {e.slots ? <p className="wsx-err wsx-pad" role="alert">{e.slots}</p> : null}
      </div>
    );
  } else if (sec === "stop") {
    body = (
      <div className="wsx-sec">
        <Row label="Words that stop everything" help="A reply that is just one of these blocks the number in every campaign, for good. STOP always stays." err={e.stop_words}>
          <div className="wsx-chips" aria-label="Stop words">
            {draft.stop_words.map((w) => (
              <span key={w}>{w}{w.toLowerCase() === "stop" ? null : <button type="button" aria-label={`Remove ${w}`} onClick={() => set({ stop_words: draft.stop_words.filter((x) => x !== w) })}>×</button>}</span>
            ))}
          </div>
          <div className="wsx-add">
            <input type="text" value={word} maxLength={40} placeholder="Add a word" aria-label="Add a stop word" onChange={(ev) => setWord(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); addWord(); } }} />
            <button type="button" className="wt-btn" onClick={addWord} disabled={!word.trim()}>Add</button>
          </div>
        </Row>
        <Row tight label="Opt-out line" help="Every Intro message ends with it. Quick replies don’t need it.">
          <span className="wsx-fixed">Reply STOP to opt out.</span>
        </Row>
        <Row tight label="Only opted-in numbers" help="Always on. A number from a sheet without an opt-in is locked until they agree.">
          <Toggle on label="Only opted-in numbers, always on" />
        </Row>
        <Row tight label="Asked to stop: pause at" help="When more than this share of the people a campaign messaged ask to stop, it pauses until you start it again. Counted from 50 people." err={e.stop_pause_pct}>
          <select value={draft.stop_pause_pct} aria-label="Pause at" onChange={(ev) => set({ stop_pause_pct: Number(ev.target.value) as 0 | 2 | 3 | 5 })}>
            <option value={0}>Never pause</option><option value={2}>2 %</option><option value={3}>3 %</option><option value={5}>5 %</option>
          </select>
        </Row>
      </div>
    );
  } else if (sec === "lang") {
    body = (
      <div className="wsx-sec">
        <Row tight label="Language for a new campaign" help="Each template has English and Hinglish; a draft without both is never sent. Each campaign can change it." err={e.language}>
          <select value={draft.language} aria-label="Language for a new campaign" onChange={(ev) => set({ language: ev.target.value as WaSettings["language"] })}>
            <option value="hi">{LANG_TEXT.hi}</option><option value="en">{LANG_TEXT.en}</option><option value="ab">{LANG_TEXT.ab}</option>
          </select>
        </Row>
      </div>
    );
  } else if (sec === "claude") {
    body = (
      <div className="wsx-sec">
        <Row tight label="Read each reply and suggest what it means" help="YES, a question, not now or STOP. You confirm it on Today; nothing moves without you." err={e.claude_read}>
          <Toggle on={draft.claude_read} label="Read each reply" onFlip={() => set({ claude_read: !draft.claude_read })} />
        </Row>
        <Row tight label="Draft the answer" help="From the right template, in their language. You can change every word before you send. Off: the template as written." err={e.claude_draft}>
          <Toggle on={draft.claude_draft} label="Draft the answer" onFlip={() => set({ claude_draft: !draft.claude_draft })} />
        </Row>
        <Row tight label="Suggest the Track from their answers" help="Data Privacy, Team Activity or Both. You set it." err={e.claude_track}>
          <Toggle on={draft.claude_track} label="Suggest the Track" onFlip={() => set({ claude_track: !draft.claude_track })} />
        </Row>
        <Row tight label="Claude never sends" help="Always. A person opens WhatsApp, presses Send and marks it sent.">
          <Toggle on label="Claude never sends, always on" />
        </Row>
      </div>
    );
  } else if (sec === "number") {
    body = (
      <div className="wsx-sec">
        <Row label="Zinwe WhatsApp Business" help="Every message leaves from this number, sent by a person in the WhatsApp Business app." err={e.wa_number}>
          <input type="text" className="wsx-text" value={draft.wa_number} maxLength={24} placeholder="+91 98100 00000" aria-label="WhatsApp Business number" onChange={(ev) => set({ wa_number: ev.target.value })} />
        </Row>
        <Row label="Name they see" help="As set in the WhatsApp Business app." err={e.wa_name}>
          <input type="text" className="wsx-text" value={draft.wa_name} maxLength={80} placeholder="Zinwe · Vishal" aria-label="Name they see" onChange={(ev) => set({ wa_name: ev.target.value })} />
        </Row>
        <Row tight label="How messages are sent" help="By a person, from the WhatsApp Business app. Never a bot on WhatsApp Web. The WhatsApp Business Platform comes later, once templates are approved.">
          <span className="wt-pill">By a person</span>
        </Row>
      </div>
    );
  } else {
    body = (
      <div className="wsx-sec">
        <Row tight label="Biggest discount in a message" help="A coupon above this can’t be picked in an Offer step, and an Offer with one isn’t sent." err={e.discount_max}>
          <select value={draft.discount_max} aria-label="Biggest discount in a message" onChange={(ev) => set({ discount_max: Number(ev.target.value) })}>
            {[...new Set([25, 40, 50, draft.discount_max])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n} %</option>)}
          </select>
        </Row>
        <Row tight label="Codes come from Coupons" help="Only codes that are live or coming show in the Offer picker. Ended codes are hidden.">
          <Link className="wt-btn" to="/coupons">Open Coupons</Link>
        </Row>
        <Row tight label="Prices in messages" help="Plan prices stay exactly as on the website. A code takes its percent off that price.">
          <Link className="wt-pill wsx-pilllink" to="/pricing">From Plans &amp; pricing</Link>
        </Row>
      </div>
    );
  }

  return (
    <WtShell label="Settings sections" current={title} side={side}>
      <div className="wt-head"><div><h2>{title}</h2><p>{desc}</p></div></div>
      {body}
      <div className="wsx-save">
        <button type="button" className="wt-btn is-dark" onClick={() => void save()} disabled={!dirty || busy}>{busy ? "Saving…" : "Save"}</button>
        {dirty ? <button type="button" className="wt-btn is-ghost" onClick={undo} disabled={busy}>Undo changes</button> : null}
        <span role="status" className={dirty ? "is-dirty" : ""}>{dirty ? "Not saved yet." : justSaved ? SAVED : lastSaved(saved)}</span>
      </div>
    </WtShell>
  );
}
