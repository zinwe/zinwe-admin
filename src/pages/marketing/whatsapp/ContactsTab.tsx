/**
 * WhatsApp → Contacts (owner's board, 12 Nov 2026). The menu: All contacts and Need you first, then where on the path,
 * segment, Track and language, with counts for the whole list from the server. The table: who, segment, where on the
 * path, Track, what goes next and when, and the last message. A row opens the contact panel; Add contacts opens the
 * upload with Check each row.
 */
import { useEffect, useState, type ReactElement } from "react";
import type { WaCampaign, WaContact, WaTemplate } from "../../../lib/whatsappApi";
import { getWaContactCounts, type WaContactC, type WaContactCounts, type WaWhereKey } from "../../../lib/whatsappApi.contacts";
import type { WaCampaignX } from "../../../lib/whatsappApi.tabs";
import { AddContacts } from "./ContactsAdd";
import { ContactPanel } from "./ContactPanel";
import {
  avatarOf, contactSub, countLocally, displayName, langOf, needOf, nextLines, nextOf, SEG_DOTS, SHORT_TRACK, trackToSet, WHERE_LISTS, whenSaid, whereOf,
} from "./contactsModel";
import { LANG_LABEL, SideItem, TRACK_LABEL, TRACKS, WtShell } from "./shared";
import "../../../styles/wa-campaigns.css";
import "../../../styles/wa-contacts.css";

/** One list at a time: all, need, a where key, or seg:<name> / track:<key> / lang:<en|hi>. */
type List = string;
const SEG_SHOWN = 8;

function listInfo(list: List, n: WaContactCounts): [string, string] {
  if (list === "all") return ["All contacts", "Everyone, newest first. Click a row to open the contact."];
  if (list === "need") return ["Need you", "A Track to set, a reply to answer or an opt-in missing. Clear these first."];
  const w = WHERE_LISTS.find((x) => x[0] === list);
  if (w) return [w[1], w[3]];
  if (list.startsWith("seg:")) return [list.slice(4) || "No segment", `Segment, set when they were added.${n.segments.find((s) => s.segment === list.slice(4))?.cities.length ? ` Mostly ${n.segments.find((s) => s.segment === list.slice(4))?.cities.join(", ")}.` : ""}`];
  if (list === "track:unset") return ["Track to set", "Said YES, Track not set yet. Their answer decides it."];
  if (list.startsWith("track:")) return [TRACK_LABEL[list.slice(6) as "privacy"], "Their Track, set from what they said they want."];
  if (list.startsWith("lang:")) return [LANG_LABEL[list.slice(5) as "en"], "The language their messages go in."];
  return ["All contacts", ""];
}

export function ContactsTab({ contacts: raw, campaigns, templates, reload }: { contacts: WaContact[]; campaigns: WaCampaign[]; templates: WaTemplate[]; reload: () => void }): ReactElement {
  const contacts = raw as WaContactC[];
  const camps = new Map((campaigns as WaCampaignX[]).filter((c) => c.id).map((c) => [c.id as number, c]));
  const [list, setList] = useState<List>("all");
  const [camp, setCamp] = useState<string>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(0);
  const [adding, setAdding] = useState(false);
  const [allSegs, setAllSegs] = useState(false);
  const [server, setServer] = useState<WaContactCounts | null>(null);

  // The menu's counts come from the server for the whole list; again whenever the contacts reload.
  useEffect(() => {
    let alive = true;
    getWaContactCounts().then((n) => { if (alive) setServer(n); }).catch(() => { if (alive) setServer(null); });
    return () => { alive = false; };
  }, [raw]);
  const n = server ?? countLocally(contacts, camps);

  const test = (c: WaContactC): boolean => {
    if (list === "all") return true;
    if (list === "need") return !!needOf(c);
    if (list.startsWith("seg:")) return c.segment === list.slice(4);
    if (list === "track:unset") return trackToSet(c);
    if (list.startsWith("track:")) return c.track === list.slice(6);
    if (list.startsWith("lang:")) return langOf(c, camps) === list.slice(5);
    return whereOf(c).key === list;
  };
  const needle = q.trim().toLowerCase();
  const rows = contacts.filter((c) => test(c)
    && (camp === "all" || (camp === "none" ? !c.campaign : String(c.campaign) === camp))
    && (!needle || `${c.firm} ${c.first_name} ${c.phone} ${c.city} ${c.segment}`.toLowerCase().includes(needle)));
  const [title, desc] = listInfo(list, n);
  const total = list === "all" ? n.all : list === "need" ? n.need : list.startsWith("seg:") ? n.segments.find((s) => s.segment === list.slice(4))?.count ?? rows.length
    : list === "track:unset" ? n.tracks.unset : list.startsWith("track:") ? n.tracks[list.slice(6) as "privacy"] ?? rows.length
      : list.startsWith("lang:") ? n.languages[list.slice(5) as "en"] ?? rows.length : n.where[list as WaWhereKey] ?? rows.length;
  const segments = n.segments.map((s) => s.segment).sort();
  const pick = (k: List, close: () => void) => () => { setList(k); setAdding(false); setOpen(0); close(); };
  const segRows = allSegs ? n.segments : n.segments.slice(0, SEG_SHOWN);
  const hasTracks = n.tracks.privacy + n.tracks.activity + n.tracks.both + n.tracks.unset > 0;
  const current = adding ? "Add contacts" : title;

  return (
    <div className="wcx">
      <WtShell label="Contact lists" current={current} side={(close) => (
        <>
          <button type="button" className="wt-new" onClick={() => { setAdding(true); setOpen(0); close(); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Add contacts
          </button>
          <label className="wt-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input type="search" aria-label="Search contacts" placeholder="Name, business or number" value={q} onChange={(e) => { setQ(e.target.value); setAdding(false); }} />
          </label>
          <div className="wt-sec" role="group" aria-label="Lists">
            <SideItem on={!adding && list === "all"} onPick={pick("all", close)} label="All contacts" sub={n.added_week ? `${n.added_week} added this week` : "Everyone you may message"} chip={<Count n={n.all} />} />
            <SideItem on={!adding && list === "need"} onPick={pick("need", close)} label="Need you" sub="Clear these first" chip={<Count n={n.need} hot />} />
          </div>
          <div className="wt-sec" role="group" aria-label="Where on the path">
            <div className="wt-sech"><span>WHERE ON THE PATH</span></div>
            {WHERE_LISTS.map(([k, label, sub]) => (
              <SideItem key={k} on={!adding && list === k} onPick={pick(k, close)} label={label} sub={sub} chip={<Count n={n.where[k]} hot={k === "replied"} />} />
            ))}
          </div>
          {n.segments.length ? (
            <div className="wt-sec" role="group" aria-label="Segment">
              <div className="wt-sech"><span>SEGMENT</span>{n.segments.length > SEG_SHOWN ? <button type="button" aria-expanded={allSegs} onClick={() => setAllSegs((o) => !o)}>{allSegs ? "Fewer" : `All ${n.segments.length}`}</button> : null}</div>
              {segRows.map((s, i) => (
                <SideItem key={s.segment} on={!adding && list === `seg:${s.segment}`} onPick={pick(`seg:${s.segment}`, close)} label={s.segment || "No segment"}
                  sub={s.cities.join(", ")} dot={SEG_DOTS[i % SEG_DOTS.length]} chip={<Count n={s.count} />} />
              ))}
            </div>
          ) : null}
          {hasTracks ? (
            <div className="wt-sec" role="group" aria-label="Track">
              <div className="wt-sech"><span>TRACK</span></div>
              {TRACKS.map((t) => (
                <SideItem key={t} on={!adding && list === `track:${t}`} onPick={pick(`track:${t}`, close)} label={SHORT_TRACK[t]} sub="Their Track" chip={<Count n={n.tracks[t]} />} />
              ))}
              <SideItem on={!adding && list === "track:unset"} onPick={pick("track:unset", close)} label="Track to set" sub="Set it now" chip={<Count n={n.tracks.unset} hot />} />
            </div>
          ) : null}
          {n.languages.en && n.languages.hi ? (
            <div className="wt-sec" role="group" aria-label="Language">
              <div className="wt-sech"><span>LANGUAGE</span></div>
              {(["en", "hi"] as const).map((l) => (
                <SideItem key={l} on={!adding && list === `lang:${l}`} onPick={pick(`lang:${l}`, close)} label={LANG_LABEL[l]} sub="Their messages" chip={<Count n={n.languages[l]} />} />
              ))}
            </div>
          ) : null}
        </>
      )}>
        {adding ? (
          <AddContacts campaigns={campaigns} segments={segments} onAdded={reload} onClose={() => setAdding(false)} />
        ) : (
          <>
            <div className="wt-head">
              <div><h2>{title}</h2><p>{desc}</p></div>
              <div className="wt-tools">
                {needle ? <button type="button" className="wt-btn is-ghost" onClick={() => setQ("")}>Clear the search</button> : null}
                <label className="wt-sel">Campaign
                  <select value={camp} aria-label="Campaign" onChange={(e) => setCamp(e.target.value)}>
                    <option value="all">All campaigns</option>
                    {campaigns.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                    <option value="none">In no campaign</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="wcx-scroll">
              <table className="wcx-table">
                <caption className="sr">{title}</caption>
                <thead>
                  <tr>
                    <th scope="col">CONTACT</th><th scope="col" className="wcx-c-seg">SEGMENT</th><th scope="col" className="wcx-c-where">WHERE ON THE PATH</th>
                    <th scope="col" className="wcx-c-trk">TRACK</th><th scope="col">NEXT</th><th scope="col" className="wcx-c-last">LAST MESSAGE</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => <Row key={c.id} c={c} camps={camps} on={open === c.id} onOpen={() => setOpen(c.id)} />)}
                </tbody>
              </table>
              {rows.length ? null : (
                <div className="wt-empty">{contacts.length ? "Nobody here. Pick another list on the left, or clear the search." : "No contacts yet. Use Add contacts to upload a sheet or add one person."}</div>
              )}
            </div>
            <p className="wt-foot">
              Showing {rows.length} of {total}. Only opted-in numbers can be messaged; a number that said STOP, band karo or mat bhejo is never messaged again.
            </p>
          </>
        )}
        {open && !adding ? <ContactPanel id={open} campaigns={campaigns} templates={templates} onClose={() => setOpen(0)} onChanged={reload} /> : null}
      </WtShell>
    </div>
  );
}

/** A menu count: orange when it needs you and isn't zero, grey otherwise. */
const Count = ({ n, hot }: { n: number; hot?: boolean }): ReactElement => <span className={"wt-pct " + (hot && n ? "is-mid" : "is-none")}>{n}</span>;

function Row({ c, camps, on, onOpen }: { c: WaContactC; camps: Map<number, WaCampaignX>; on: boolean; onOpen: () => void }): ReactElement {
  const { name } = displayName(c);
  const where = whereOf(c);
  const need = needOf(c);
  const [nextMain, nextSub] = nextLines(nextOf(c), c.campaign ? camps.get(c.campaign) : undefined);
  const last = c.last_message !== undefined ? c.last_message : c.last ? { text: c.last.text, at: c.last.at, direction: c.last.kind === "theirs" ? "in" as const : "out" as const, by: "" } : null;
  return (
    <tr className={on ? "is-on" : ""} onClick={onOpen}>
      <td>
        <button type="button" className="wcx-who" aria-label={`Open ${name}`} onClick={(e) => { e.stopPropagation(); onOpen(); }}>
          <span className="wcx-av" aria-hidden="true">{avatarOf(name)}</span>
          <span>
            <b>{name}</b>
            <small>{contactSub(c, camps)}</small>
            <small className="wcx-phoneonly">{where.label}</small>
          </span>
        </button>
      </td>
      <td className="wcx-c-seg"><div className="wcx-cell"><span title={c.segment}>{c.segment || "—"}</span></div></td>
      <td className="wcx-c-where"><div className="wcx-cell"><span>{where.label}</span><small>{where.sub}</small></div></td>
      <td className="wcx-c-trk">
        <div className="wcx-cell">
          {c.track ? <span className="wt-pill" title={TRACK_LABEL[c.track]}>{SHORT_TRACK[c.track]}</span>
            : trackToSet(c) ? <span className="wcx-flag"><i />Set the Track</span> : <small>—</small>}
        </div>
      </td>
      <td>
        <div className="wcx-cell">
          <span className={need === "reply" || need === "optin" ? "wcx-flag" : ""}>{need === "reply" || need === "optin" ? <i /> : null}{nextMain}</span>
          <small>{nextSub}</small>
        </div>
      </td>
      <td className="wcx-c-last">
        <div className="wcx-cell wcx-last">
          <span>{last ? last.text : "—"}</span>
          <small>{last ? `${last.direction === "in" ? "Them" : "You"} · ${whenSaid(last.at)}` : "No messages"}</small>
        </div>
      </td>
    </tr>
  );
}
