import { useState, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api";
import { getPersonas, savePersona, type Persona } from "../../lib/marketingApi";
import { useLoad } from "../../lib/useLoad";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/PageHeader";
import { ErrorState, LoadingState } from "../../components/States";
import { useToast } from "../../components/Toast";
import { CONFIDENCE } from "./data";
import { formOf, sectionsDone, SECTIONS } from "./persona";
import "../../styles/marketing.css";

function NewPersona({ personas, onClose }: { personas: Persona[]; onClose: () => void }): ReactElement {
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [from, setFrom] = useState(String(personas[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      const base = personas.find((p) => String(p.id) === from);
      const made = await savePersona({ name: name.trim(), confidence: "Guess", profile: base?.profile ?? {} });
      navigate(`/marketing/persona/${made.id}?tab=profile`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add that.", "bad");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New persona"
      subtitle="Start from an existing persona and change what differs, or start blank."
      size="small"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn dark" disabled={busy || !name.trim()} onClick={() => void add()}>Add persona</button>
        </>
      }
    >
      <div className="mk mk-imp">
        <label className="fl">Persona name
          <input className="inp" type="text" autoFocus maxLength={120} value={name} placeholder="Example: Office manager" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="fl">Start from
          <select className="inp" value={from} onChange={(e) => setFrom(e.target.value)}>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="">Blank</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}

export function PersonaListPage(): ReactElement {
  const { data, error, pending, reload } = useLoad(getPersonas);
  const [adding, setAdding] = useState(false);

  return (
    <div className="mk">
      <PageHeader title="Persona" subtitle="The base customer behind every target audience and campaign." onReload={reload} pending={pending}>
        <button type="button" className="btn dark" disabled={!data} onClick={() => setAdding(true)}>New persona</button>
      </PageHeader>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <LoadingState /> : data.length ? (
        <div className="pgrid">
          {data.map((p) => {
            const done = sectionsDone(p);
            const n = p.audience_count ?? 0;
            return (
              <Link key={p.id} to={`/marketing/persona/${p.id}`} className="card pcard">
                <div className="fighead">
                  <h2>{p.name}</h2>
                  <span className={"pill " + CONFIDENCE[p.confidence][0]} title={CONFIDENCE[p.confidence][1]}>{p.confidence}</span>
                </div>
                <p>{formOf(p, "definition").customer || "No ideal customer written yet."}</p>
                <div className="afbar" aria-hidden="true"><i style={{ width: `${(done / SECTIONS.length) * 100}%` }} /></div>
                <span className="k">{done} of {SECTIONS.length} sections complete · {n} target {n === 1 ? "audience" : "audiences"}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <section className="card empty">No personas yet.</section>
      )}
      {adding && data ? <NewPersona personas={data} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
