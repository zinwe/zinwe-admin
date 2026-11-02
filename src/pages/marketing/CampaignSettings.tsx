import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { campaignAction, deleteCampaign, getAudiences, getBlocked, patchCampaign, type Audience, type CampaignDetail } from "../../lib/marketingApi";
import { useLoad } from "../../lib/useLoad";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { nice, type Ctx } from "./campaignShared";

export function SettingsTab({ c, sender, run }: Ctx): ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const [removing, setRemoving] = useState(false);
  const load = useCallback(() => getBlocked(), []);
  const blocked = useLoad(load);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  useEffect(() => { void getAudiences().then(setAudiences).catch(() => undefined); }, []);
  const dns: [keyof CampaignDetail["dns_result"], string][] = [["spf", "SPF"], ["dkim", "DKIM"], ["dmarc", "DMARC"]];
  return (
    <>
      <section className="card editor">
        <h2>This campaign</h2>
        <div className="two">
          <label className="fl">Campaign name
            <input className="inp" key={c.name} defaultValue={c.name} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.name) void run(() => patchCampaign(c.id, { name: e.target.value.trim() }), "Saved."); }} />
          </label>
          <label className="fl">Target audience
            <select className="inp" value={c.audience} disabled={c.status !== "draft"} onChange={(e) => void run(() => patchCampaign(c.id, { audience: Number(e.target.value) }), "Saved.")}>
              {audiences.length ? audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>) : <option value={c.audience}>{c.audience_name}</option>}
            </select>
          </label>
          <label className="fl">Daily limit
            <select className="inp" value={c.daily_limit} onChange={(e) => void run(() => patchCampaign(c.id, { daily_limit: Number(e.target.value) }), "Saved.")}>
              {sender.limits.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <span className="k">Start at 10 a day and raise it only if bounces and complaints stay low. Emails leave one at a time, about 45 seconds apart, after you approve the batch.</span>
      </section>
      <div className="hgrid">
        <section className="card editor">
          <h2>Sender</h2>
          <div className="psy">
            <div><span>Outreach from</span><b>{sender.from}</b></div>
            <div><span>Replies go to</span><b>{sender.reply_to}</b></div>
          </div>
          <div className="fr">
            <span className={"pill " + (sender.mailbox_ready ? "good" : "warn")}>{sender.mailbox_ready ? "Mailbox connected" : "Mailbox not connected"}</span>
            {sender.mailbox_ready ? <span className="k">{sender.smtp_host}</span> : null}
          </div>
          <span className="k">Outreach sends through its own mailbox, never the product mail account, so it can’t affect sign-in codes or invoices.</span>
        </section>
        <section className="card editor">
          <h2>Domain: {sender.domain}</h2>
          <div className="todo">
            {dns.map(([k, label]) => {
              const ok = c.dns_result?.[k];
              return <div key={k} className={ok ? "done" : ""}><span className={"pill " + (ok ? "good" : "warn")}>{ok ? "Pass" : c.dns_checked_at ? "Missing" : "Not checked"}</span><span>{label}</span></div>;
            })}
          </div>
          <div className="fr">
            <button type="button" className="btn sm" onClick={() => void run(() => campaignAction(c.id, "dns"), "Records checked.")}>Check records</button>
            {c.dns_checked_at ? <span className="k">Checked {nice(c.dns_checked_at)}</span> : null}
          </div>
        </section>
      </div>
      <section className="card editor">
        <h2>Cold email rules</h2>
        <ol className="rlist">
          <li>Use named work addresses only, filtered with each firm name checked. Never a bought list.</li>
          <li>Send at most 2 cold emails, then stop if there is no reply.</li>
          <li>Keep to the daily limit, and start at 10 a day.</li>
          <li>Send from the separate domain, never zinwe.io.</li>
          <li>Put an unsubscribe link and the postal address in every email.</li>
        </ol>
        <label className="mk-check">
          <input type="checkbox" checked={!!c.rules_checked_at} onChange={(e) => void run(() => campaignAction(c.id, "rules", { checked: e.target.checked }), "Saved.")} />
          We checked the cold email rules for the USA and India
        </label>
        {c.rules_checked_by ? <span className="k">Marked by {c.rules_checked_by}</span> : null}
      </section>
      <section className="card editor">
        <h2>Email footer</h2>
        <div className="foot">This is a promotional email. To stop hearing from me, reply “no” or unsubscribe.{"\n"}{sender.postal_address}{"\n"}Zinwe · Security, simplified. IT Is OK.</div>
        <span className="k">Added to every email automatically.</span>
      </section>
      <section className="card tablebox">
        <div className="fighead pad"><h2>Do not email</h2><span className="k">Applies to every campaign</span></div>
        {blocked.data?.length ? (
          <div className="scroll">
            <table className="tbl narrow">
              <caption className="sr">Do not email</caption>
              <thead><tr><th scope="col">Address</th><th scope="col">Reason</th><th scope="col">Added</th></tr></thead>
              <tbody>{blocked.data.map((b) => <tr key={b.email}><th scope="row">{b.email}</th><td>{b.reason}</td><td>{nice(b.created_at)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <div className="empty">Nobody is blocked.</div>}
      </section>
      {c.status === "draft" && c.report.funnel[0]?.value === 0 ? (
        <section className="card editor">
          <h2>Remove this draft</h2>
          <span className="k">Nothing has been sent from it. This deletes its emails and {c.counts.total} contact{c.counts.total === 1 ? "" : "s"}.</span>
          <button type="button" className="btn sm mk-start" onClick={() => setRemoving(true)}>Remove draft</button>
        </section>
      ) : null}
      {removing ? (
        <ConfirmDialog
          title="Remove this draft?"
          confirmLabel="Remove draft"
          danger
          confirmText={c.counts.total ? c.name : undefined}
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await deleteCampaign(c.id);
            toast("Draft removed.");
            navigate("/marketing/email");
          }}
        >
          {c.counts.total ? `Its ${c.counts.total} contacts go with it. Type the campaign name to confirm.` : "Its emails will be deleted."}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
