/**
 * The 90-day campaign (100 Reviews) on one contact: Set the Track from their Engage answer, the path so far, and the
 * steps staff record by hand (setup error, first PC connected, paid, a testimonial back).
 */
import { type ReactElement } from "react";
import { useToast } from "../../../components/Toast";
import { actOn, patchWaContact, type WaAction, type WaCampaignStatus, type WaContact, type WaPack, type WaTrack } from "../../../lib/whatsappApi";
import { CAMPAIGN_STATUS, errText, suggestTrack, TESTIMONIAL_LABEL, TRACK_LABEL, TRACKS, trackName, when } from "./shared";

const PATH: WaCampaignStatus[] = ["messaged", "replied", "yes", "engaged", "track_assigned", "demo_video_sent", "setup", "demo_call", "offer", "paid"];

/** Track buttons from their last answer, with the suggested one marked. Staff decide; unclear = ask again. */
export function TrackSetter({ c, onDone }: { c: WaContact; onDone: (next: WaContact, done: string) => void }): ReactElement {
  const toast = useToast();
  const answer = [...(c.messages ?? [])].reverse().find((m) => m.kind === "theirs")?.text ?? (c.last?.kind === "theirs" ? c.last.text : "");
  const hint = suggestTrack(answer);
  const pick = async (track: WaTrack) => {
    try {
      const next = await actOn(c.id, "track", track);
      onDone(next, `Track set: ${TRACK_LABEL[track]}. Its Demo videos come next.`);
    } catch (err) {
      toast(errText(err, "Couldn't save the Track."), "bad");
    }
  };
  return (
    <section className="wa-track" aria-label="Set the Track">
      <b>Set the Track</b>
      <span className="k">Their Engage answer decides which Demo videos they get. Segment stays as it is.</span>
      {answer ? <div className="wa-chat"><div className="wa-bub">{answer}</div></div> : <span className="k">No answer from them yet.</span>}
      <div className="fr" role="group" aria-label="Track">
        {TRACKS.map((t) => (
          <button key={t} type="button" className={"btn sm" + (t === hint ? " dark" : "")} title={t === hint ? "Suggested from their words" : undefined} onClick={() => void pick(t)}>
            {TRACK_LABEL[t]}{t === hint ? " · suggested" : ""}
          </button>
        ))}
        <button type="button" className="btn sm" onClick={() => toast("The Track stays Unassigned. Ask one more question: answer them from Today.")}>Unclear: ask again</button>
      </div>
      <span className="k">Files, data or access → Data Privacy. The team’s day or who works on what → Team Activity Monitoring. Both, clearly said → Both Pack.</span>
    </section>
  );
}

/** The campaign part of the contact drawer. */
export function CampaignSection({ c, run }: { c: WaContact; run: (work: () => Promise<WaContact | null>, done: string) => Promise<void> }): ReactElement {
  const status = c.campaign_status ?? "";
  const at = PATH.indexOf(status);
  const act = (action: WaAction, done: string) => void run(() => actOn(c.id, action), done);
  const needsTrack = !!c.yes_date && !c.track && status !== "paid" && status !== "opted_out";
  return (
    <div className="mk-sec">
      <h3>90-day campaign</h3>
      <dl>
        <dt>Status</dt><dd>{CAMPAIGN_STATUS[status][0]}</dd>
        <dt>Day · stage</dt><dd>{c.day ? `Day ${c.day} of 90 · stage ${c.stage}` : "Not started"}</dd>
        <dt>Track</dt><dd>{trackName(c.track)}</dd>
        <dt>Testimonial</dt><dd>{TESTIMONIAL_LABEL[c.testimonial ?? ""]}{c.using_since ? ` · first PC ${when(c.using_since)}` : ""}</dd>
      </dl>
      {needsTrack ? <TrackSetter c={c} onDone={(next, done) => void run(async () => next, done)} /> : (
        <label className="fl">Track <span className="k">From their Engage answer; picks the Demo videos</span>
          <select className="inp" value={c.track} onChange={(e) => void run(() => patchWaContact(c.id, { track: e.target.value as WaTrack }), "Track changed.")}>
            <option value="">Unassigned</option>
            {TRACKS.map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}
          </select>
        </label>
      )}
      <label className="fl">Pack for the offer <span className="k">Empty = from their team size (up to 10 PCs: Startup)</span>
        <select className="inp" value={c.pack ?? ""} onChange={(e) => void run(() => patchWaContact(c.id, { pack: e.target.value as WaPack }), "Pack saved.")}>
          <option value="">From team size</option>
          <option value="startup">Startup pack</option>
          <option value="team">Team pack</option>
        </select>
      </label>
      <ol className="wa-path" aria-label="The path">
        {PATH.map((s, i) => <li key={s} className={i <= at ? "done" : ""}>{CAMPAIGN_STATUS[s][0]}{s === "demo_call" ? <span className="k">only on a setup error</span> : null}</li>)}
      </ol>
      <div className="mk-acts">
        {c.setup_error
          ? <button type="button" className="btn sm" onClick={() => act("setup_ok", "Setup error cleared.")}>Setup error fixed</button>
          : <button type="button" className="btn sm" onClick={() => act("setup_error", "Setup error saved: the Demo call goes next.")}>Setup hit an error</button>}
        <button type="button" className="btn sm" disabled={!!c.using_since} onClick={() => act("using", "First PC connected: the testimonial is due in 14 days.")}>First PC connected</button>
        <button type="button" className="btn sm" disabled={status === "paid"} onClick={() => act("paid", "Marked as paid.")}>Mark paid</button>
        <button type="button" className="btn sm" disabled={c.testimonial === "written" || c.testimonial === "video"} onClick={() => act("review_written", "Written testimonial saved.")}>Got a written testimonial</button>
        <button type="button" className="btn sm" disabled={c.testimonial === "video"} onClick={() => act("review_video", "Video testimonial saved.")}>Got a video testimonial</button>
      </div>
    </div>
  );
}
