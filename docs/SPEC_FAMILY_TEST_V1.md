# Spec — Family test v1: arrive-by answer + saved trips

Status: draft for owner review · 2026-10-19 · web app (bridge to native, per step 3 in `PROJECT_STATE.md`)

## Problem statement

When a family member is about to leave for an appointment, the question is "can I just take the train and still be on time?" The app today compares **cost only**: it ignores the arrival deadline, which is what usually decides the trip. It also makes them re-enter the same trip every time.

**Evidence is thin:** this rests on the owner's experience and the plan v0.2 reasoning, not on observed use. The family test exists to supply that evidence.

## Goals

Measured from the family trip diary over 2 weeks (definitions in `PROJECT_STATE.md` → Metrics):

1. **Fast:** a saved trip gives an answer in under 30 seconds from opening the app.
2. **Right:** when the app says "take the train", people arrive on time at least 90% of the time.
3. **Trusted:** people follow the answer at least 70% of the time, and would choose differently afterwards no more than 10% of the time.
4. **Used:** every family member uses it in both weeks.

## Non-goals (v1)

| Not in v1 | Why |
|---|---|
| Live disruptions / traffic | Needs the LTA key and proxy (approved, next phase). v1 tests the rule on static estimates first. |
| Native app, widget, notifications | Waits on the diary result: are hesitations about regular trips? |
| Learning habits / memory | Saved trips are typed by the user, not learned. Learning stays gated (plan Decision 3). |
| Syncing trips across phones, accounts | Saved trips stay on one phone. No server for user data. |
| Booking Grab, live Grab prices | No API; out of scope permanently. |

## User stories

**Family member at the door (main user)**
1. As a family member going to a regular appointment, I want to tap my saved trip and see whether to take the train, so I don't re-enter the trip each time.
2. As someone who must arrive by a set time, I want the app to tell me when to leave if I take the train, so I can plan instead of paying for speed.
3. As someone running late, I want the app to tell me plainly when the train won't make it and what will, so I don't find out on the platform.
4. As someone who's already too late for anything, I want "fastest option, leave now, you'll be late" rather than a confident-looking plan, so I'm not misled.
5. As a cautious user, I want the full cost comparison one tap away, so I can overrule the recommendation if I want to.

**Owner setting it up for family**
6. As the owner, I want to set up mum's regular trips on her phone once, so she only ever taps.

## Requirements

### P0 — must have

**R1. Arrive-by time input.** Optional time field. Blank means "leaving now".
- Given an 8.9 km trip, it's 12:00 and arrive by is 14:00, when the user asks, then the headline reads "Take the MRT · leave by 13:18".
- Given arrive by 12:40, then the headline says the train would be late and recommends the cheaper on-time option (Drive, leave by 12:12).
- Given arrive by 12:20, then it says nothing is on time and recommends the fastest option, "leave now", clearly marked as late.
- Given the field is blank, then no deadline is applied (no "late" warnings).
- A time earlier than now is read as tomorrow? **No:** show "That time has passed" and ask again. Never guess the day.
- Logic already exists and is tested (`recommendForSchedule`, `test/schedule.test.js`). This is UI wiring.

**R2. Reason is visible.** The headline states which case applies (train on time / train late / nothing on time), and the cost comparison stays visible below or one tap away.
- The leave-by time is labelled as an estimate, naming the MRT speed assumption (H4).

**R3. Saved trips.** Save the current trip with a name (for example "Mum → SGH"): destination, distance, parking hours, optional usual arrive-by time, and an optional **usual door-to-door train time** (`mrtMinutes`), which replaces the 25 km/h estimate and is labelled "your usual 35 min". Show the list at the top when opening the app; one tap fills everything and shows the answer.
- Stored on the phone only (`localStorage`), wrapped so the app still works if storage is blocked (private browsing).
- Edit, delete, up to 10 trips.
- Saved values are inputs only. Rates and fares always come from the current `data/*.json`, so a price update reaches saved trips automatically.
- Storage format is a small versioned JSON record, so the native app can read the same shape later.

**R4. Add to home screen.** A web manifest and icon so the app installs with its own icon on iPhone and Android.

### P1 — nice to have

- **P1-1. Offline:** a service worker so it opens with no signal, using the versioned cache plan from the architecture PDF.
- **P1-2. Reason chips:** rain, luggage, kids or mobility can escalate past an on-time train. These need a rule, not just a chip (open question 4).
- **P1-3. Adjustable buffer:** the 10-minute default, editable per trip.
- **P1-5. Grab as a gamble:** show when Grab makes the time only on a typical wait (logic built: `gambles`, `grab_gamble`).
- **P1-4. Share a trip as a link:** encodes the saved trip in the URL, so the owner can send mum's trips to her phone. No server involved.

### P2 — design for, don't build

- **Live alert slot:** the headline has room for "NEL disrupted today", fed later by the proxy.
- **Native widget:** reads the same saved-trip format and shows the last computed answer.
- **Exception-only mode** (from the brainstorm): stay quiet when the usual answer holds, and speak up only when it flips.

## Success metrics

| Metric | Type | Target | Measured by |
|---|---|---|---|
| Time to answer (saved trip) | Leading | < 30 s | Diary |
| Train-on-time hit rate | Leading | ≥ 90% | Diary |
| Follow rate | Leading | ≥ 70% | Diary |
| Regret rate | Lagging | ≤ 10% | Diary |
| Used in both weeks | Lagging | Every person | Diary |
| Regular-trip share | Decision input | > 50% → build widget | Diary |

Evaluate after 2 weeks of family use.

## Open questions

| # | Question | Who | Blocking? |
|---|---|---|---|
| 1 | When did someone last hesitate — regular trip or one-off? (Decides widget vs app focus.) | Owner | No for v1; yes for native |
| 2 | ~~Is 25 km/h fair?~~ Answered 2026-10-20: SMRT is predictable, so saved trips use the family's own train time; a real routing source (OneMap) is pending for one-off trips. | Owner | Resolved for saved trips |
| 3 | Keep the leave-now rule "MRT if within 15 min of fastest"? | Owner | No |
| 4 | Which reasons should override an on-time train, and to what? | Owner | Only for P1-2 |
| 5 | Is a 10-minute buffer right? | Owner | No |
| 6 | Diary format: shared trip-log page or WhatsApp notes? | Owner | Yes, before the test starts |

## Timeline

No hard deadline. Suggested order:

1. **R1 + R2** (logic done; UI only).
2. **R3 + R4** (saved trips, home-screen install).
3. **2-week family test** with the diary.
4. **Then decide:** live alerts via proxy (needs the owner's LTA key) and native/widget, based on the diary.

Dependencies: none for steps 1–3. Step 4 needs the LTA DataMall key and, for iPhone distribution, an Apple Developer account (US$99/yr).
