# OpsBot: what it was taught, and what it still misses

OpsBot has two layers: the rule-based engine (`src/lib/opsbot.js`) and the Claude layer (`src/lib/opsbot-ai.js`, needs `ANTHROPIC_API_KEY`).

## Taught so far
- Roman Urdu bridge (`urduBridge`): aaj, kal (yesterday after a past-tense word, tomorrow otherwise), kaun, kahan, kitna, kharcha, chutti, aaya/gaya, ghante, paisa, baqi, hazri, mehman, shikayat, nahi, sab, din, "is mahine", "pichle mahine", "is saal".
- Dastarkhawan without the word "Dastarkhawan": overtime, duty hours/time, short hours, "worked less than N hours", rotation.
- New answers: short time this month, average duty day, "thanks", petty cash balance.
- Site rotation: "where should Zeeshan be on 20 Nov", "who is supposed to be at Okara tomorrow", "plan vs actual".
- AI system prompt: glossary (PTO, Leaves, OT, short, sites, rotation) and a Roman Urdu cheat-sheet, plus a tool-choice guide.

## Question bank used to check it (about 80 questions)
Dastarkhawan today / late / absent / a person / a site; overtime; leaves and PTO; days per site; rotation; short hours; office attendance; spending by year/month/head/office; budget; cash and advances; expenses waiting or rejected; visitors; complaints; tasks; fuel; help and thanks. Run them through `opsbotAnswer` and look for the replies that start "I did not understand".

## Known gaps (not answered)
- "Who missed check out" (office attendance), guard duty today, new hires.
- "Who is on leave today" without a team word answers for office staff only, not Dastarkhawan.
- Leave questions in Roman Urdu with no team word go to office time-off.
