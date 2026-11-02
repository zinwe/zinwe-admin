import type { ReactElement } from "react";
import type { Sender } from "../../lib/marketingApi";
import { fill } from "./campaignShared";

const safe = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** How an email reads in the inbox, footer included. Used for campaign emails and for templates. */
export function EmailPreview({ sender, subject, body, sample, phone }: { sender: Sender; subject: string; body: string; sample: { first_name: string; firm: string; email: string }; phone: boolean }): ReactElement {
  // The HTML comes from the editor or the server's cleaned copy. Names are escaped before they join it.
  const html = fill(body, { first_name: safe(sample.first_name), firm: safe(sample.firm) }).replace(/<p>\[Signed-up contacts only: [\s\S]*?\]<\/p>/, "");
  return (
    <div className={"pvframe" + (phone ? " phone" : "")}>
      <div className="pvmail">
        <h3>{fill(subject, sample)}</h3>
        <div className="pvfrom"><i>V</i><div><b>{sender.from.split("<")[0].trim()}</b> <span>&lt;{sender.from.split("<")[1]?.replace(">", "")}&gt;</span><span>to {sample.first_name} &lt;{sample.email}&gt;</span></div></div>
        <div className="pvbody" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="pvfoot">This is a promotional email. To stop hearing from me, reply “no” or <span className="pvlink">unsubscribe</span>.<br />{sender.postal_address}<br />Zinwe · Security, simplified. IT Is OK.</div>
      </div>
    </div>
  );
}
