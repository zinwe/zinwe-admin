import type { WaCampaign } from "../../../lib/whatsappApi";

/** The outreach skill Claude in Chrome loads first, every run: the owner updates it weekly from the responses. */
export const OUTREACH_SKILL = "/zinwe-kelash-whatsapp-outreach";

/**
 * The prompt staff paste into Claude in Chrome to run a saved campaign: the admin stays the source of truth for who
 * is due and at which stage, Claude works through Today in one tab and WhatsApp Web in another, and marks each send
 * in the admin straight away so both stay in step.
 */
export function claudeCommand(c: WaCampaign, origin: string, confirmEach: boolean): string {
  const today = `${origin}/marketing/whatsapp`;
  const close = c.touch3 ? `, a polite close on day ${c.touch3_days}` : "";
  return `${OUTREACH_SKILL}

Run today's round of the Zinwe WhatsApp campaign "${c.name}" in this Chrome window.

Before you start
1. Use the ${OUTREACH_SKILL} skill above for every message and every reply: its tone, structure and rules. If anything below disagrees with it, the skill wins, except the safety rules at the end.
2. Open the Zinwe admin at ${today} (I'm signed in) and keep it in one tab. Open WhatsApp Web (web.whatsapp.com, the Zinwe WhatsApp Business number) in a second tab.
3. Only work on contacts in the campaign "${c.name}". The admin decides who is due and at which stage; never message anyone it doesn't list.

Each round
4. Replies first. In Today, "Replies to answer": read what they wrote in WhatsApp Web, press the matching button (Interested, Asked a question, Not now, or Stop, never again), check the draft against the skill and its "Notes for replies", fix it if needed, press Open in WhatsApp, send it, come back and press Mark as sent.
   If someone wrote on WhatsApp but isn't listed, paste their message into "Someone replied on WhatsApp?" first.
5. Then "Messages to send" for "${c.name}", top to bottom (after-YES steps come first). For each one: read the draft and its notes, improve the first line only with facts from the contact's notes, press Open in WhatsApp, check the chat opened for the right business and number, send it, then come back and press Mark as sent straight away so the admin stays in step.
6. Attach the creative only when the admin shows a file next to the draft. Never on a first message.

Stages (the admin applies them; don't override)
- Ready: the first message on day 0.
- Messaged with no reply: a tip on day ${c.followup_days}${close}, then nothing more.
- Interested or Signed up: the after-YES step the admin shows.
- Not now, Do not message, and Not opted in: never message them.

Safety, always
- At most ${c.daily_limit} new messages today; stop when the admin shows nothing due.
- Wait 30 to 90 seconds between sends, and never paste the same text into many chats.
- STOP, unsubscribe, "band karo" or "mat bhejo": don't reply; press Stop, never again.
- If WhatsApp shows any warning or limit, or more than 1 in 20 people block or say STOP today, stop at once and tell me.
- Never invent facts, prices, discounts or features. Prices only from zinwe.io/plans.
${confirmEach ? "- Show me each message and wait for my OK before you press Send." : "- Send without asking me, but stop and ask for anything the skill or the notes don't cover."}

When you finish, tell me: messages sent, replies answered, new YES, STOP or blocks, and anything that needs me.`;
}
