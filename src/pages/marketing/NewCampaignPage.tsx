import { useCallback, useState, type ReactElement } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { createCampaign, getAudiences, getCampaigns } from "../../lib/marketingApi";
import { useLoad } from "../../lib/useLoad";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, LoadingState } from "../../components/States";
import { useToast } from "../../components/Toast";
import { AudienceCard } from "./AudienceCard";
import { Section } from "./fields";
import "../../styles/marketing.css";

const COPY = "copy";

export function NewCampaignPage(): ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const load = useCallback(() => Promise.all([getCampaigns(), getAudiences()]), []);
  const { data, error, reload } = useLoad(load);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState(Number(params.get("audience")) || 0);
  const [pattern, setPattern] = useState("full");
  const [source, setSource] = useState(0);
  const [busy, setBusy] = useState(false);

  if (error) return <div className="mk"><ErrorState message={error} onRetry={reload} /></div>;
  if (!data) return <div className="mk"><LoadingState /></div>;
  const [{ sender, campaigns }, audiences] = data;
  const audience = audiences.find((a) => a.id === picked) ?? null;
  const from = source || campaigns[0]?.id || 0;
  const chosen = pattern === COPY ? campaigns.find((c) => c.id === from)?.emails_count : sender.patterns.find((p) => p.key === pattern)?.emails;
  const ready = Boolean(name.trim() && audience && chosen);

  const create = async () => {
    if (!audience) return;
    setBusy(true);
    try {
      const made = await createCampaign({ name: name.trim(), audience: audience.id as number, ...(pattern === COPY ? { copy_from: from } : { pattern }) });
      toast("Draft campaign added. Nothing has been sent.");
      navigate(`/marketing/email/${made.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add that.", "bad");
      setBusy(false);
    }
  };

  return (
    <div className="mk">
      <PageHeader title="New campaign" subtitle="A campaign sends one email pattern to one target audience. It starts as a draft." />
      <Link className="lnk afback" to="/marketing/email">Back to campaigns</Link>
      <div className="afgrid">
        <form className="afmain" noValidate onSubmit={(e) => e.preventDefault()}>
          <Section n={1} title="What will you call it?" help="Only your team sees this name." done={Boolean(name.trim())}>
            <label className="fl">Campaign name
              <input className="inp" type="text" autoFocus maxLength={120} value={name} placeholder="Example: Texas CPA firms, first round" onChange={(e) => setName(e.target.value)} />
            </label>
          </Section>
          <Section n={2} title="Who is it for?" help="Pick a target audience from your personas." done={Boolean(audience)}>
            {audiences.length ? (
              <label className="fl">Target audience
                <select className="inp" value={picked} onChange={(e) => setPicked(Number(e.target.value))}>
                  <option value={0}>Choose one</option>
                  {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            ) : <p className="mk-note">Add a target audience first, in <Link to="/marketing/persona">Persona</Link>.</p>}
          </Section>
          <Section n={3} title="Which email pattern?" help="Every pattern starts with two cold emails. You can edit each email after this." done={Boolean(chosen)}>
            <div className="patpick" role="radiogroup" aria-label="Email pattern">
              {sender.patterns.map((p) => (
                <button key={p.key} type="button" role="radio" aria-checked={pattern === p.key} className="patc" onClick={() => setPattern(p.key)}>
                  <b>{p.name}</b><span>{p.text}</span><small>{p.emails} emails</small>
                </button>
              ))}
              {campaigns.length ? (
                <button type="button" role="radio" aria-checked={pattern === COPY} className="patc" onClick={() => setPattern(COPY)}>
                  <b>Copy a campaign</b><span>Start from the emails in one of your campaigns, with your edits.</span>
                </button>
              ) : null}
            </div>
            {pattern === COPY ? (
              <label className="fl">Copy the emails from
                <select className="inp" value={from} onChange={(e) => setSource(Number(e.target.value))}>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.emails_count} emails)</option>)}
                </select>
              </label>
            ) : null}
            <span className="k">The ready-made emails were written for CPA firms. You will read and adjust them for this audience before launch.</span>
          </Section>
          <div className="card affoot">
            <Link className="btn" to="/marketing/email">Cancel</Link>
            <button type="button" className="btn dark" disabled={busy || !ready} onClick={() => void create()}>Create draft campaign</button>
          </div>
        </form>
        <aside className="card afrail" aria-label="This campaign so far">
          <div className="fighead"><h2>This campaign goes to</h2></div>
          {audience ? <AudienceCard a={audience} /> : <span className="k">Pick a target audience to see them here.</span>}
          {chosen ? <span className="k">{chosen} emails · Nothing sends until you approve each day’s batch.</span> : null}
        </aside>
      </div>
    </div>
  );
}
