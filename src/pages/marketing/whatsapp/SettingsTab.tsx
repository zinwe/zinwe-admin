/**
 * Marketing -> WhatsApp -> Settings (wa3, 11 Nov 2026), in the Templates look: the sections on the left, each one's
 * content in cards. Read only: the base rule changes when the owner's SOP does. Wording from the AdminWaSettings board
 * (SOP of 6 Nov) and the rules this tab showed before.
 */
import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { SideItem, WtShell } from "./shared";

const SLOTS = ["10–12", "12–14", "14–17", "17–19"];
/** The base rule: a campaign may be stricter, never looser. */
const RULES: [string, string, ("slots" | "coupon")?][] = [
  ["Who gets it", "Opted-in numbers only (the admin refuses the rest at upload)."],
  ["Who sends", "A person sends, from the admin’s Open in WhatsApp link, then Mark as sent. Never bulk, never automation."],
  ["Campaign length", "90 days in three stages, to the same audience."],
  ["Values", "One value per stage: the segment’s most urgent problem, then the second value, then everything in one place."],
  ["Messages", "30 messages, one every 3 days, never more than one a day."],
  ["Send window", "10:00–19:00 Mon–Sat.", "slots"],
  ["Offers and discounts", "Each stage its own pack, discount and code with the per-PC value,", "coupon"],
  ["Language", "One flavour per campaign, English or Hinglish, decided from country, state and segment. Switch to the contact’s language if they reply in another."],
  ["Message shape", "Longer messages (the moment and the fix, one question, “Reply STOP to opt out” at the end)."],
  ["Links", "No link in the first message, one at most after."],
  ["When to stop", "Stop on YES / STOP / day 90. A YES starts the YES path; STOP, band karo or mat bhejo stops for good."],
  ["Words", "“protect company data”, “with your team’s knowledge”; never spy, catch or monitor; no invented numbers."],
];
const MODES: { title: string; pill?: [string, string]; text: string; tone: "on" | "" | "dashed" }[] = [
  { title: "By a person, from the WhatsApp Business app", pill: ["In use", "is-good"], tone: "on", text: "Zinwe drafts each message. Open in WhatsApp fills in the chat; you press Send on the Zinwe WhatsApp Business number, then Mark as sent here." },
  { title: "WhatsApp Business Platform", pill: ["Later", "is-none"], tone: "", text: "Official sending through Meta with approved templates, only for people who said yes or signed up. Replies would arrive here by themselves." },
  { title: "Never: a bot that sends from WhatsApp Web", tone: "dashed", text: "WhatsApp bans numbers that send automatically through WhatsApp Web or browser tools. Zinwe doesn't do this." },
];
const LISTS = [
  "Only businesses you found yourself, each with a source. Never a bought list.",
  "The first message says who you are and how to stop.",
  "STOP, block or \"not interested\" means never again, in every campaign.",
  "Message between 10:00 and 19:00, Monday to Saturday, in the contact's time. A send due on a Sunday moves to Monday.",
  "Real contacts live in production only. Dev and local get a few test numbers.",
  "US office numbers are often landlines with no WhatsApp: use email for US firms.",
  "Older three-touch campaigns: at most one follow-up, and no reply means we stop.",
];

type Section = "rules" | "sending" | "lists";
const HEAD: Record<Section, [string, string, string]> = {
  rules: ["Base rule", "The floor under every campaign", "Before day 1 each campaign writes down its name, dates, segments, three values, packs and codes, flavour and send slot. The rules below are the floor under every campaign: a campaign may be stricter, never looser."],
  sending: ["How messages are sent", "By a person, never a bot", "How WhatsApp messages leave Zinwe. The base rule applies whichever way a message goes out."],
  lists: ["Lists and numbers", "Who you may message", "Where contacts come from, and the numbers you never message."],
};

export function SettingsTab(): ReactElement {
  const [sec, setSec] = useState<Section>("rules");
  const [title, , desc] = HEAD[sec];
  let main: ReactElement;
  if (sec === "rules") {
    main = (
      <div className="wtx-rules">
        {RULES.map(([name, text, extra]) => (
          <article key={name} className="wc-card wtx-rule">
            <h3>{name}</h3>
            <p>
              {text}
              {extra === "coupon" ? <> at most 40 % off the first billing cycle, with an end date. Codes live in <Link to="/coupons">Coupons</Link>; an expired code is replaced by the current stage’s code.</> : null}
            </p>
            {extra === "slots" ? <div className="wtx-slotrow">{SLOTS.map((s) => <span key={s} className="wtx-slot">{s}</span>)}<span className="k">four slots, one per contact per campaign</span></div> : null}
          </article>
        ))}
      </div>
    );
  } else if (sec === "sending") {
    main = (
      <div className="wtx-pad wtx-stack">
        {MODES.map((m) => (
          <article key={m.title} className={"wc-card wtx-mode" + (m.tone ? ` is-${m.tone}` : "")}>
            <div className="wtx-modeh"><h3>{m.title}</h3>{m.pill ? <span className={`wt-pct ${m.pill[1]}`}>{m.pill[0]}</span> : null}</div>
            <p>{m.text}</p>
          </article>
        ))}
        <p className="k">Claude drafts: personalised when ANTHROPIC_API_KEY is set on the server, otherwise the template with the name and business filled in.</p>
      </div>
    );
  } else {
    main = (
      <div className="wtx-pad">
        <article className="wc-card wtx-rule">
          <h3>Rules for every campaign</h3>
          <ul className="wa-rules">{LISTS.map((r) => <li key={r}>{r}</li>)}</ul>
        </article>
      </div>
    );
  }
  return (
    <WtShell label="Settings sections" current={title} side={(close) => (
      <div className="wt-sec">
        {(Object.keys(HEAD) as Section[]).map((k) => (
          <SideItem key={k} on={sec === k} onPick={() => { setSec(k); close(); }} label={HEAD[k][0]} sub={HEAD[k][1]}
            chip={k === "rules" ? <span className="wt-pct is-none">{RULES.length}</span> : k === "lists" ? <span className="wt-pct is-none">{LISTS.length}</span> : null} />
        ))}
      </div>
    )}>
      <div className="wt-head">
        <div><h2>{title}</h2><p>{desc}</p></div>
      </div>
      {main}
      <div className="wt-foot">Stricter is fine: a campaign can send fewer messages, give a smaller discount or use a shorter window. It cannot go the other way. Owner’s SOP of 6 Nov 2026; this page changes only when the SOP does.</div>
    </WtShell>
  );
}
