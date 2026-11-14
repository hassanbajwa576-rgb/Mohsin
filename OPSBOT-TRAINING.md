# OpsBot: what it was taught, and what it still misses

OpsBot has two layers: the rule-based engine (`src/lib/opsbot.js`, free) and the Claude layer (`src/lib/opsbot-ai.js`). The Claude layer is billed separately by Anthropic (the $20 plan does not include API use), so it is **off by default**: it runs only when both `OPSBOT_AI=on` and `ANTHROPIC_API_KEY` are set in Vercel. The app uses the free rule-based OpsBot.

## Taught so far
- Roman Urdu bridge (`urduBridge`): aaj, kal (yesterday after a past-tense word, tomorrow otherwise), kaun, kahan, kitna, kharcha, chutti, aaya/gaya, ghante, paisa, baqi, hazri, mehman, shikayat, nahi, sab, din, "is mahine", "pichle mahine", "is saal".
- Dastarkhawan without the word "Dastarkhawan": overtime, duty hours/time, short hours, "worked less than N hours", rotation.
- New answers: short time this month, average duty day, "thanks", petty cash balance, temporary guards on duty today (Guard Duty permission), new joiners in the last 60 days (Dastarkhawan and office), Dastarkhawan days with a check in but no check out (last 14 days).
- Site rotation: "where should Zeeshan be on 20 Nov", "who is supposed to be at Okara tomorrow", "plan vs actual".
- AI system prompt: glossary (PTO, Leaves, OT, short, sites, rotation) and a Roman Urdu cheat-sheet, plus a tool-choice guide.

## Question bank used to check it (about 80 questions)
Dastarkhawan today / late / absent / a person / a site; overtime; leaves and PTO; days per site; rotation; short hours; office attendance; spending by year/month/head/office; budget; cash and advances; expenses waiting or rejected; visitors; complaints; tasks; fuel; help and thanks. Run them through `opsbotAnswer` and look for the replies that start "I did not understand".

## Known gaps (not answered)
- "Who missed check out" for office attendance (only Dastarkhawan is covered).
- Free-form questions: OpsBot matches patterns, so unusual wording can still fall to "I did not understand that". Send the question and it can be added.
- "Who is on leave today" already covers both teams (the roster query is shared) but does not label the team.
