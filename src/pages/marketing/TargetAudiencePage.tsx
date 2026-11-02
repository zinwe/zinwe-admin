import { useCallback, useRef, useState, type ReactElement } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { deleteAudience, getAudience, getPersona, saveAudience, type Audience, type ChipKey, type Persona } from "../../lib/marketingApi";
import { useLoad } from "../../lib/useLoad";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, LoadingState } from "../../components/States";
import { useToast } from "../../components/Toast";
import { AudienceCard } from "./AudienceCard";
import { audienceBrief, blankAudience, BUSINESS_TYPE_TEXT, BUSINESS_TYPES, CHANNEL_GUIDE, CHANNELS, COUNTRIES, OBJECTIVE_TEXT, OBJECTIVES, suggest, suggestedChannels } from "./data";
import { AutoText, ChipField, Choice, ComboField, Section, splitChips, UnsavedGuard, useCopy } from "./fields";
import { rowsOf } from "./persona";
import "../../styles/marketing.css";

const CHIPS: Record<ChipKey, { label: string; placeholder: string; hint?: string; comma?: boolean }> = {
  key_benefits: { label: "What they get out of it", placeholder: "Pick one or type your own", hint: "Press Enter to add. Paste a list, one per line, to add several at once." },
  job_titles: { label: "Job titles to look for", placeholder: "Pick a title or type your own", comma: true },
  decision_makers: { label: "Who makes the decision", placeholder: "Pick one or type your own", comma: true },
  industry_keywords: { label: "Words their industry uses", placeholder: "Pick a word or type your own", comma: true },
  competitors: { label: "Who they might compare us with", placeholder: "Pick a name or type your own", comma: true },
};

const REQUIRED: [keyof Audience, string][] = [
  ["name", "Give this group a name."],
  ["country", "Pick a country."],
  ["business_category", "Say what kind of business they run."],
  ["business_segment", "Say which of these businesses you mean."],
  ["primary_problem", "Add their biggest worry."],
  ["product_service", "Add the product or service."],
  ["how_solves", "Say how it helps with that worry."],
  ["primary_offer", "Add what we offer them first."],
  ["cta", "Add the words on the button or link."],
];

function ChannelPicker({ d, persona, error, onChange }: { d: Audience; persona: Persona; error?: string; onChange: (channels: string[]) => void }): ReactElement {
  const plans = rowsOf(persona, "channels");
  const suggested = suggestedChannels(d.business_category, d.country);
  const all = [...new Set([...CHANNELS, ...d.channels])];
  return (
    <>
      <div className="chpick" role="group" aria-label="Channels">
        {all.map((name) => {
          const at = d.channels.indexOf(name);
          const on = at >= 0;
          const guide = CHANNEL_GUIDE[name];
          return (
            <div key={name} className={"chc" + (on ? " on" : "")}>
              <button type="button" className="chb" aria-pressed={on} onClick={() => onChange(on ? d.channels.filter((c) => c !== name) : [...d.channels, name])}>
                <b>{name}</b>
                <span>{plans.find((r) => r.channel === name)?.strategy || guide?.[0]}</span>
                {guide ? <small>{guide[1]}</small> : null}
              </button>
              {at === 0 ? <span className="chtag best">Best</span> : null}
              {at > 0 ? <button type="button" className="chtag" aria-label={`Make ${name} the best channel`} onClick={() => onChange([name, ...d.channels.filter((c) => c !== name)])}>Make best</button> : null}
              {!on && suggested.includes(name) ? <span className="chtag">Suggested</span> : null}
            </div>
          );
        })}
      </div>
      <span className="k">The first one you pick is your best channel. Email is the channel that runs from this panel today.</span>
      {error ? <span className="aferr" role="alert">{error}</span> : null}
    </>
  );
}

function AudienceForm({ start, persona }: { start: Audience; persona: Persona }): ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const [d, setD] = useState(start);
  const [pending, setPending] = useState<Partial<Record<ChipKey, string>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [more, setMore] = useState(Boolean(start.id && (start.decision_makers.length || start.industry_keywords.length || start.competitors.length || start.notes)));
  const { copy, dialog } = useCopy(toast);
  const leaving = useRef(false);
  const back = `/marketing/persona/${persona.id}`;
  const dirty = JSON.stringify(d) !== JSON.stringify(start) || Object.values(pending).some(Boolean);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);

  const patch = (p: Partial<Audience>) => {
    setD((cur) => ({ ...cur, ...p }));
    setErrors({});
  };
  /** Text typed but not yet added still counts: nothing is lost on Save or Copy. */
  const committed = (): Audience => {
    const out = { ...d };
    for (const [key, value] of Object.entries(pending) as [ChipKey, string][]) {
      const merged = [...out[key]];
      for (const v of splitChips(value, CHIPS[key].comma)) if (!merged.some((x) => x.toLowerCase() === v.toLowerCase())) merged.push(v);
      out[key] = merged;
    }
    return out;
  };
  const view = committed();
  const steps = [
    Boolean(view.name.trim() && view.country),
    Boolean(view.business_category.trim() && view.business_segment.trim()),
    Boolean(view.primary_problem.trim()),
    Boolean(view.product_service.trim() && view.how_solves.trim() && view.key_benefits.length),
    Boolean(view.primary_offer.trim() && view.cta.trim()),
    view.channels.length > 0,
  ];
  const doneCount = steps.filter(Boolean).length;

  const combo = (field: keyof Audience, label: string, placeholder?: string, hint?: string, multiline?: boolean) => (
    <ComboField label={label} value={String(d[field] ?? "")} onChange={(v) => patch({ [field]: v })} groups={suggest(field, d, persona)} placeholder={placeholder} hint={hint} error={errors[field]} multiline={multiline} />
  );
  const chip = (key: ChipKey) => (
    <ChipField
      {...CHIPS[key]}
      items={d[key]}
      groups={suggest(key, d, persona)}
      error={errors[key]}
      pending={pending[key] ?? ""}
      onPending={(v) => setPending((p) => ({ ...p, [key]: v }))}
      onChange={(list) => patch({ [key]: list })}
      duplicate={(n) => toast(n === 1 ? "That one is already added." : `${n} items were already added.`)}
    />
  );

  const save = async () => {
    const final = committed();
    const bad: Record<string, string> = {};
    for (const [field, message] of REQUIRED) if (!String(final[field] ?? "").trim()) bad[field] = message;
    if (!final.key_benefits.length) bad.key_benefits = "Add at least one thing they get out of it.";
    if (!final.channels.length) bad.channels = "Pick at least one channel.";
    setD(final);
    setPending({});
    if (Object.keys(bad).length) {
      setErrors(bad);
      toast("Answer the questions marked in red first.", "bad");
      return;
    }
    setBusy(true);
    try {
      await saveAudience({ ...final, name: final.name.trim() });
      leaving.current = true;
      toast("Target audience saved.");
      navigate(back);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      toast(err instanceof ApiError ? err.message : "Couldn't save that.", "bad");
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={start.id ? start.name : "Who do you want to reach?"} subtitle={`Answer in the words they would use. This starts from ${persona.name}, so some answers are already in.`} />
      <Link className="lnk afback" to={back}>Back to {persona.name}</Link>
      <div className="afgrid">
        <form className="afmain" noValidate onSubmit={(e) => e.preventDefault()}>
          <Section n={1} title="Who are they, and where?" help="Name this group the way you would say it out loud. Leave state or city empty to cover all of it." done={steps[0]}>
            <div className="two">
              <label className="fl">Name this group
                <input className="inp" type="text" maxLength={120} value={d.name} placeholder="Example: Texas CPA firms" onChange={(e) => patch({ name: e.target.value })} />
                {errors.name ? <span className="aferr" role="alert">{errors.name}</span> : null}
              </label>
              <label className="fl">Country
                <select className="inp" value={d.country} onChange={(e) => patch({ country: e.target.value })}>
                  {[...new Set([...COUNTRIES, d.country])].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              {combo("state", "State", "All states")}
              <label className="fl">City
                <input className="inp" type="text" maxLength={80} value={d.city} placeholder="All cities" onChange={(e) => patch({ city: e.target.value })} />
              </label>
            </div>
          </Section>
          <Section n={2} title="What kind of business do they run?" help="Pick a kind of business and the next questions get better suggestions." done={steps[1]}>
            <div className="two">
              {combo("business_category", "Kind of business", "Pick one or type your own")}
              {combo("business_segment", "Which of these businesses?", "Example: Firms of 5–15 people")}
            </div>
            <Choice label="Who are their customers?" value={d.business_type} options={BUSINESS_TYPES} text={BUSINESS_TYPE_TEXT} onChange={(v) => patch({ business_type: v })} />
          </Section>
          <Section n={3} title="What worries them most?" help="Write it the way the owner would say it to a friend." done={steps[2]}>
            {combo("primary_problem", "Their biggest worry", "Pick one or type your own")}
            {combo("secondary_problem", "Another worry (optional)", "Pick one or type your own")}
          </Section>
          <Section n={4} title="How does Zinwe help?" help="Only what ships today." done={steps[3]}>
            {combo("product_service", "Product or service")}
            {combo("how_solves", "How it helps with that worry", "Pick an answer or write your own", "Shift+Enter starts a new line.", true)}
            {chip("key_benefits")}
          </Section>
          <Section n={5} title="What should they do next?" help="One small first step works better than a big ask." done={steps[4]}>
            {combo("primary_offer", "What we offer them first", "Pick one or type your own")}
            <Choice label="What counts as a win?" value={d.objective} options={OBJECTIVES} text={OBJECTIVE_TEXT} onChange={(v) => patch({ objective: v })} />
            {combo("cta", "Words on the button or link", "Pick one or type your own")}
            <label className="fl">Price to mention (optional)
              <AutoText value={d.pricing} onChange={(v) => patch({ pricing: v })} />
              <span className="k">Copy should point to zinwe.io/plans, not a number.</span>
            </label>
          </Section>
          <Section n={6} title="Anything else that helps?" help="Job titles, who decides, their words, who we get compared with, and notes." tag="Optional" done={false}>
            <button type="button" className="afopen" aria-expanded={more} onClick={() => setMore((m) => !m)}>{more ? "Hide these questions" : "Show these questions"}</button>
            {more ? (
              <>
                {chip("job_titles")}
                {chip("decision_makers")}
                {chip("industry_keywords")}
                {chip("competitors")}
                <label className="fl">Notes
                  <AutoText value={d.notes} onChange={(v) => patch({ notes: v })} />
                </label>
              </>
            ) : null}
          </Section>
          <Section n={7} title="Where will you reach them?" help="Pick every channel they actually use." done={steps[5]}>
            <ChannelPicker d={d} persona={persona} error={errors.channels} onChange={(channels) => patch({ channels })} />
          </Section>
          <div className="card affoot">
            <div className="fr">
              <Link className="btn" to={back}>Cancel</Link>
              {start.id && !start.campaign_count ? <button type="button" className="btn" disabled={busy} onClick={() => setRemoving(true)}>Remove audience</button> : null}
            </div>
            <button type="button" className="btn dark" disabled={busy} onClick={() => void save()}>Save target audience</button>
          </div>
        </form>
        <aside className="card afrail" aria-label="This audience so far">
          <div className="fighead">
            <h2>This audience so far</h2>
            <span className="k">{doneCount} of {steps.length} answered</span>
          </div>
          <div className="afbar" aria-hidden="true"><i style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
          <AudienceCard a={view} />
          <button type="button" className="btn dark" onClick={() => void copy(audienceBrief(view, persona))}>Copy for AI</button>
          <details className="afmore">
            <summary>See what gets copied</summary>
            <p className="k">It includes the base persona. Paste it into Claude or ChatGPT, then type your question at the end.</p>
            <pre className="afbrief" tabIndex={0}>{audienceBrief(view, persona)}</pre>
          </details>
        </aside>
      </div>
      <UnsavedGuard blocker={blocker} dirty={dirty} />
      {removing ? (
        <ConfirmDialog
          title="Remove this target audience?"
          confirmLabel="Remove audience"
          danger
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            await deleteAudience(start.id as number);
            leaving.current = true;
            toast("Target audience removed.");
            navigate(back);
          }}
        >
          No campaign uses it. This can't be undone.
        </ConfirmDialog>
      ) : null}
      {dialog}
    </>
  );
}

export function TargetAudiencePage(): ReactElement {
  const params = useParams();
  const id = Number(params.id);
  const aid = params.aid ? Number(params.aid) : null;
  const load = useCallback(async () => {
    const persona = await getPersona(id);
    return { persona, audience: aid ? await getAudience(aid) : blankAudience(persona) };
  }, [id, aid]);
  const { data, error, reload } = useLoad(load);
  return (
    <div className="mk">
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <LoadingState /> : <AudienceForm key={aid ?? "new"} start={data.audience} persona={data.persona} />}
    </div>
  );
}
