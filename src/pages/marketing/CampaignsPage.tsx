import type { ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getCampaigns } from "../../lib/marketingApi";
import { useLoad } from "../../lib/useLoad";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, LoadingState } from "../../components/States";
import { CAMPAIGN_STATUS, EmailTabs, patternName } from "./campaignShared";
import "../../styles/marketing.css";

export function CampaignsPage(): ReactElement {
  const { data, error, pending, reload } = useLoad(getCampaigns);
  const navigate = useNavigate();
  const rows = data?.campaigns ?? [];
  return (
    <div className="mk">
      <PageHeader title="Email campaigns" subtitle="Each campaign sends one email pattern to one target audience." onReload={reload} pending={pending}>
        <Link className="btn dark" to="/marketing/email/new">New campaign</Link>
      </PageHeader>
      <EmailTabs />
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <LoadingState /> : rows.length ? (
        <section className="card tablebox">
          <div className="scroll">
            <table className="tbl">
              <caption className="sr">Email campaigns</caption>
              <thead>
                <tr>
                  <th scope="col">Campaign</th>
                  <th scope="col">Status</th>
                  <th scope="col">Email pattern</th>
                  <th scope="col" className="num">Contacts</th>
                  <th scope="col" className="num">Emailed</th>
                  <th scope="col" className="num">Replied</th>
                  <th scope="col" className="num">Signed up</th>
                  <th scope="col">Needs you</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const asks = [c.ready_today && c.status === "active" ? `${c.ready_today} to approve` : "", c.counts.needs_you ? `${c.counts.needs_you} to follow up` : ""].filter(Boolean);
                  return (
                    <tr key={c.id} className="click" onClick={() => navigate(`/marketing/email/${c.id}`)}>
                      <th scope="row">
                        <Link className="cobtn" to={`/marketing/email/${c.id}`} onClick={(e) => e.stopPropagation()}>{c.name}</Link>
                        <span className="k">{c.audience_name}</span>
                      </th>
                      <td><span className={"pill " + CAMPAIGN_STATUS[c.status][1]}>{CAMPAIGN_STATUS[c.status][0]}</span></td>
                      <td>{patternName(data.sender, c.pattern, c.emails_count)}<span className="k" style={{ display: "block" }}>{c.emails_count} emails</span></td>
                      <td className="num">{c.counts.total}</td>
                      <td className="num">{c.emailed}</td>
                      <td className="num">{c.replied}</td>
                      <td className="num">{c.signed_up}</td>
                      <td>{asks.length ? asks.map((a) => <span key={a} className="pill warn" style={{ marginRight: 4 }}>{a}</span>) : <span className="k">All clear</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="card empty">
          <b>Start your first campaign</b>
          <span>Pick a target audience and an email pattern. Nothing sends until you approve it.</span>
          <Link className="btn dark" to="/marketing/email/new">New campaign</Link>
        </section>
      )}
    </div>
  );
}
