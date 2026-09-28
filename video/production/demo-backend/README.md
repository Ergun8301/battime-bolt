# BEMEXO demo backend (fake Supabase + static server)

One local Node process on **http://localhost:4600** that:

- serves the static export `../app/out` (built with `NEXT_PUBLIC_SUPABASE_URL=http://localhost:4600/sb`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=demo-anon-key`) with clean URLs;
- fakes Supabase under `/sb` — PostgREST, RPC, GoTrue, Storage, Edge Functions — over an in-memory,
  stateful store seeded by `fixtures.js` (fictional company « Delorme Rénovation », S-39 = 21→27 Sept 2026);
- exposes a control API under `/__demo`.

**Zero cost, zero prod.** No external service, no proxying, no npm dependency at runtime (Node 22 only;
`playwright-core` is used by the smoke test only). The real Supabase project is never contacted; every
unknown `/sb` route answers **501** and is flagged in the log. All people, companies, addresses, NIR,
e-mails (`*.example`) are fictional.

## Run

```bash
cd demo-backend
node server.js                       # scene s1 at start; Ctrl-C to stop
# background, with a pid file (never `pkill -f "node server.js"`: other agents run node servers too)
nohup node server.js > server.log 2>&1 & echo $! > server.pid
kill "$(cat server.pid)"
```

Env: `DEMO_PORT` (4600), `DEMO_HOST` (default: listens on 127.0.0.1 **and** ::1), `DEMO_OUT` (static dir,
default `../app/out`), `DEMO_SCENE` (initial scene, `s1`), `DEMO_INSTANCE` (free text echoed by `/__demo/health`).

## Session injection (logged-in admin / salarié / chef without the login screen)

The app uses supabase-js **2.117.2** / auth-js 2.117.2 (package.json asks `^2.58.0`, the lockfile resolves
2.117.2). supabase-js computes the storage key as `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
(`node_modules/@supabase/supabase-js/dist/index.cjs:647`) → **`sb-localhost-auth-token`**. auth-js stores
`JSON.stringify(session)` there (`_saveSession`, no separate `-user` key since no `userStorage` is configured)
and on load only requires `access_token`, `refresh_token` and `expires_at` (`_isValidSession`); it refreshes
only if `expires_at` is within 90 s of the (fake) browser clock — ours is 2036, so **no network call at boot**.

```js
const session = await (await fetch('http://localhost:4600/__demo/session?email=karim.benali@delorme-renovation.example')).json();
// or ?user=karim | sophie | julien | lucas | sofia | mehdi | ines | thomas | yanis
await context.addInitScript(([k, v]) => localStorage.setItem(k, v),
  ['sb-localhost-auth-token', JSON.stringify(session)]);
```

Session shape (same as `POST /sb/auth/v1/token?grant_type=password`, any password):

```json
{ "access_token": "<unsigned JWT: header.payload.sig, sub=<user id>, aud/role 'authenticated', exp 2036-01-01>",
  "token_type": "bearer", "expires_in": 292…, "expires_at": 2082758400,
  "refresh_token": "demo-refresh-<user id>",
  "user": { "id", "aud": "authenticated", "role": "authenticated", "email", "app_metadata", "user_metadata", … } }
```

The role/screen comes from `users.role` (admin → `/admin`, worker/lead → `/poseur`, lead also gets
« Mon équipe aujourd'hui »). Driving the real `/connexion` form also works (any password).

Recommended Playwright context (what `smoke.js` uses): `locale 'fr-FR'`, `timezoneId 'Europe/Paris'`,
`serviceWorkers 'block'`, `acceptDownloads true`, geolocation + permission, `context.clock.install({time})`
**before** `goto`, Chromium args `--no-proxy-server --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost" --lang=fr-FR`
(`--lang` makes `<input type=date>` read dd/mm/yyyy). Google Fonts: `../assets/fonts/route-fonts.js`.

## Control API

| Route | Effect |
|---|---|
| `POST /__demo/reset {scene, now?}` (or `?scene=`) | Rebuilds the whole store for the preset (generated at the **preset** time) and sets the demo clock to the preset time, or to `now` (ISO with offset) when given. Clears the log. Returns the scene, clocks and calibrated budgets. |
| `POST /__demo/clock {now, frozen?}` | Sets the demo clock. It then flows at real speed (like `page.clock.install`) unless `frozen:true`. `GET` returns it. |
| `GET /__demo/log` | Every request since the reset: `{t (demo clock), method, path, status, ms, who, body?, note?, flag?}` + `unknown` (flagged entries) + counters. `?since=<i>`, `?flagged=1`, `?sb=1`. |
| `GET /__demo/state?table=x[&col=value…][&limit=n]` | Raw rows (debug). No `table` → row counts. Special: `table=__outbox` (what send-push / payroll e-mail / invites *would* have sent), `table=__storage`. |
| `GET /__demo/session?email=… \| ?user=karim` | Session JSON for localStorage (above). |
| `GET /__demo/scenes`, `GET /__demo/users`, `GET /__demo/health` | Presets, demo users, liveness (`instance`, `pid`, `port`, `scene`, `clock`). |

Log flags: `unsupported` (HTTP 501: unknown route / query feature — never proxied), `schema` (unknown
column/table → PostgREST-like 400), `self-heal` (`ensure_planning_slot` / `ensure_other_worksite` fired —
fixtures are built so it never happens on load; it DOES fire, legitimately, when the admin grid is (re)loaded after a
worker sent a line he added himself during a live chain, e.g. Karim's Les Cèdres — that is the real app's self-repair,
and `unknown` in `/__demo/log` excludes it), `storage-miss`, `static-404`, `empty-upload`, `server-error`.
Flagged requests are also printed in red on stderr.

## Scene presets (times Europe/Paris)

| Scene | Clock | State |
|---|---|---|
| `s1` | Thu 24/09 07:25 | Nobody sent Thursday. Sessions: Lucas 07:02 (Le Central), Sofia 07:10 (Dubois), Thomas 07:15 & Julien 07:05 (Jules-Ferry) → **4 en direct**. Karim: planning Villa Martin 07:30–12:00, no session. Cockpit: **8 salariés · 3 en attente · 4 en direct · 44 pièces**. |
| `s2` | 07:29:30 | = s1 (just before « Je commence »). |
| `s2x` | 07:31 | s1 + Karim en direct at Villa Martin since 07:30:00 (start position 45.8994, 6.1281 ± 12 m) → 5 en direct. |
| `s3a` | 16:32 | Karim: DRAFT Villa Martin 07:30–12:00 (planning linked, positions start 07:30 / end 12:00 45.8996, 6.1279 ± 9), panier off, no session, + 2 morning photos (Photo 1/2 — 24/09/2026). Others: Sofia, Julien, Yanis sent; Lucas, Thomas, Mehdi drafts; sessions closed (their morning lines carry positions). |
| `s3b` / `s4b` | 16:44 | s3a + DRAFT Résidence Les Cèdres 12:45–16:30 (worker-added, no planning, `gap_before 'route'`), panier on (flag on the first line of the day, as `applyDayMeal` does). |
| `s4` | 17:05 | Karim's day SENT at 16:46: Villa Martin `reception 'avec'` « Joint silicone manquant fenêtre salon » + « Photo 3 — 24/09/2026 » (linked to that line), Cèdres slot `added_by_worker`. Thomas & Mehdi sent; Lucas still drafts. |
| `s5` | 17:20 | = s4 → Réserves: **2 à traiter** (Karim + Sofia « Seuil de la porte-fenêtre à reprendre », corrigée sur place le 23), 3 levées. |
| `s7` | 17:30 | = s4 (congés, habilitations, import). |
| `s7c` | 10:20 | Chef view (Julien): Thomas DRAFT 07:30–10:00 at Jules-Ferry, Yanis nothing; Julien/Lucas/Sofia still en direct. |
| `s6` | Wed 30/09 17:00 | Every September working day sent (Lucas' 22–23 and Yanis' 21 sent late), Karim's Thursday as s4 but Cèdres **corrected by the office 12:45–16:00** (correction row, `notified_at` set, entry `modified_at/by`), Sofia's réserve lifted, nothing exported, August closed, September open. |
| `s6x` | 30/09 17:05 | s6 after export: every September line `exported_at` 17:03 + `locked`, September closed. |

Worker-side « Photo 3 » needs Photo 1/2 of the same (chantier, day): the DB trigger numbers photos per
(worksite, work_date) — so the seed has 2 morning photos on 24/09 and a live upload during s3b gives
« Photo 3 — 24/09/2026 », exactly like s4.

## Fixtures (fixtures.js)

- Company `0d3c0001-…-000000000001` « Delorme Rénovation », `subscription_status 'active'`, `trial_ends_at null`,
  travel paid, 35 h, overtime 25/50 %, `accountant_email compta@cabinet.example`, position tracking on,
  reminder 17 h, budget alerts on, logo `…/sb/storage/v1/object/public/company-logos/<company>/logo.svg`
  (served from `../assets/brand/logo-client-dr.svg`, fallback: black/yellow « DR » SVG). No invitation.
- Users (`firstname.lastname@delorme-renovation.example`, `photo_url null`): Sophie Durand (admin), Karim Benali
  (worker, matricule **00042**, 32,50 €/h), Julien Morel (lead), Lucas Martin, Sofia Rossi, Mehdi Haddad, Inès Garcia,
  Thomas Petit, Yanis Bernard. Each worker/lead has `user_payroll` (29–38 €/h, 5-digit matricule, fake NIR `… 99 999 …`,
  hire date, CDI). Avatar tints are distinct too (brute-forced ids).
- Worksites (client — trade — city): Villa Martin — Menuiseries — Annecy · Résidence Les Cèdres — Rénovation — Seynod ·
  Restaurant Le Central — Agencement — Annecy · Maison Dubois — Menuiseries — Argonay · École Jules-Ferry — Peinture —
  Cran-Gevrier · Cabinet Lefèvre — Plâtrerie — Annecy-le-Vieux · `Autre`. Ids brute-forced
  (`tools-bruteforce-ids.js`) so `CHANTIER_PALETTES[hashStr(id) % 7]` gives 6 different bubble colours
  (VM amber, Cèdres green, Central brick, Dubois violet, Jules-Ferry plum, Lefèvre olive).
- History from **Mon 31 Aug** (so week S-36 is complete: the payroll CSV recaps whole weeks) to the day before
  "now"; the 31/08 lines are sent, **exported 02/09 09:10 and locked** (August is closed). Deterministic (seeded) crews and day shapes — 8 h
  (07:30–12:00 / 13:00–16:30, `gap_before 'pause'`), some 9 h, Friday 7 h, ~13 % split days with a 30-min
  `route` gap; panier ~86 %; a few `en_cours`/`sans`; every sent line has its planning row. Future days of the
  displayed week: planning only (each week is planned the Friday before at 16:30). Weekends empty.
- Special cases: Inès congé 21–25 (+ approved request), Mehdi intempérie 23, Lucas planned/not sent 22–23,
  Yanis 21 (→ « 3 en attente »), Karim S-39 9 h / 8 h 45 / 9 h 30, Julien + Thomas + Yanis at Jules-Ferry on
  Thursday, Mehdi RDV 08:00 Friday at Lefèvre. Réserves: Sofia 21/09 Dubois (fixed 23/09) + 3 lifted earlier in
  September on Cèdres/Central/Lefèvre.
- Documents: 44 at s1 (39 photos `Photo N — DD/MM/YYYY` → `../assets/photos/chantier-NN.jpg` matched by trade,
  5 PDFs « Devis signé.pdf », « Plan RDC.pdf », « PV de réception.pdf » → `../assets/docs/*.pdf`; fallbacks:
  neutral JPEG `static/placeholder.jpg`, generated one-page PDF).
- Habilitations (UI prints « type — label »): Sofia CACES — R486 Nacelle (30/09/2026 → « expire dans 6 j » on the 24th),
  Habilitation électrique — B1V (15/03/2027), Visite médicale (19/10/2026); Karim Carte BTP, Travail en hauteur;
  Thomas CACES — R489 Chariot; Julien Habilitation électrique — BR.
- Leave: Karim pending 12→16 Oct « Mariage de mon frère », Karim approved 17→21 Aug, Thomas refused
  « Période de livraison, on en reparle », Inès approved 21→25 Sept.
- Dépenses: Villa Martin matériaux « Menuiseries alu — lot 2 » 2 480 €, location « Nacelle 2 jours » 380 €;
  Cèdres « Plaques de plâtre » 640 €, sous-traitance « Électricité » 1 450 €; Le Central divers « Évacuation gravats » 290 €.
- Budgets (`budget_hours`) are **calibrated at every reset** from the scene's own history, the way
  `my_worksite_labour(null,null)` counts them (sent lines + paid route): Villa Martin **84 %**, Cèdres **76 %**,
  Central **103 %**, Dubois **55 %**, Lefèvre **38 %**, Jules-Ferry none (integer hours; `Math.round` hits the target).
- `month_closures`: August 2026.

## Supabase surface implemented

**PostgREST** `/sb/rest/v1/<table>` GET/HEAD/POST/PATCH/DELETE: select lists with renames/casts and embeds
`alias:table!hint(cols)` (FK column or constraint name, m2o and o2m, `!inner`), filters `eq neq gt gte lt lte like ilike
is in` + `not.` + `or=(…)`/`and=(…)` (nested), `order` with `nullsfirst/last` (Postgres defaults), `offset/limit`
(fetchAllPaged ends on an empty page), `Prefer count=exact` → `Content-Range a-b/N` (HEAD too), `return=representation`
(else 201/204 empty), `resolution=merge-duplicates|ignore-duplicates` + `on_conflict`, `Accept vnd.pgrst.object+json`
(bare object, 406 PGRST116 otherwise). Errors `{code,message,details,hint}`: 23505 → 409, RLS → 403 42501,
raise → 400 P0001, unknown column → 400 42703/PGRST204, invalid JSON body (table or RPC) → 400 PGRST102. Types are normalised (time `HH:MM:SS`, date, timestamptz
`…+00:00`, numeric as numbers).

**Mini-RLS** (from the migrations): everything scoped to the caller's company (from the JWT `sub`); time_entries/
planning readable by admin, the owner, or the lead for a colleague sharing one of his chantiers **today**
(`is_my_team_member`, so the TeamDay query without filters returns only his team); payroll, certifications,
expenses, invitations admin-only; worker writes limited to own draft/sent unlocked lines; month closure blocks
worker writes (« time_entries: le mois est clôturé par le bureau »).

**Server behaviour**: generated `total_minutes`; `guard_time_entry_write` (reset fields on insert, `submitted_at`
= demo clock on draft→submitted, `modified_at/by` on edits of sent lines and on office edits, forbidden transitions);
`active_sessions.started_at`/`start_located_at` set by trigger from the demo clock (positions dropped if tracking
off); document guard (worksite check, `work_date` from the line, label `Photo N — DD/MM/YYYY` numbered per
chantier-day); month-closure guard (open clock-in → refused with the names); unique violations 23505
(`time_entries_client_id_unique`, `one_meal_per_day`, `active_sessions_pkey`, `month_closures_pkey`,
`user_payroll_matricule_unique`, …); cascades.

**RPC** `/sb/rest/v1/rpc/<fn>`: `stop_active_session` (quarter-hour rounding, draft line, start/end
`time_entry_positions` when tracking on and < 14 h, deletes the session, BT001 when start = end → returns
`[{entry_id, work_date, start_time, end_time}]`), `correct_time_entry` (→ `[{correction_id, worker_id, work_date,
old_start, old_end, new_start, new_end, corrected_by_role}]`), `my_worksite_labour` (route rule mirrored from SQL
→ `{worksite_id, user_id, worked_minutes, route_minutes, paid_minutes, cost, unpriced_minutes}`),
`set_reserve_resolution`, `mark_reserve_fixed`, `request_leave` (→ uuid), `set_user_role`,
`set_worksite_client_email`, `set_position_tracking` (→ boolean), `update_company_info`, `update_my_photo`,
`ensure_planning_slot`, `ensure_other_worksite` (→ uuid), `save_push_subscription`. Void → 204.

**GoTrue** `/sb/auth/v1`: `token?grant_type=password|refresh_token`, `GET/PUT user`, `logout` (204), `recover`,
`resend`, `otp`, `settings`. **Storage** `/sb/storage/v1`: `object/sign/<bucket>` (batch) and single sign,
signed/public/authenticated GET, upload POST/PUT (multipart or raw, bytes kept in memory, `x-upsert`), DELETE
`{prefixes}`. **Functions** `/sb/functions/v1`: `send-push` → `{sent:1}`, `send-payroll-export` → `{}` (same
`idempotencyKey` again → `{duplicate:true, alreadySentAt}`), `invite-worker` → `{ok:true}` (+ users & invitations
rows; `action:'revoke'`), `weekly-digest`, `cert-expiry-alerts` → `{ok:true}`, `stripe-*` → **403**. Nothing is sent
anywhere; see `/__demo/state?table=__outbox`.

## Self-test

```bash
node smoke.js                 # all presets + live actions (~5 min); screenshots in smoke/
node smoke.js s1 s7 --no-live
node smoke.js --shared        # against the running :4600 instead of a private instance
```

By default it starts its **own private backend on :4687** (`SMOKE_PORT`) and re-routes the browser's `:4600`
traffic to it through `route.fetch` (so it never resets the shared :4600 others are filming with). Checks, per
preset: admin `/admin` (1600×900) and salarié/chef `/poseur` (390×844 mobile) load with no `pageerror`, no request
off localhost (fonts served from `../assets/fonts`), no 501/flagged request, no ensure_* self-heal, no stuck
« Chargement »; s1 cockpit « 8 salariés », « 3 en attente », « 4 en direct » and 6 distinct bubble colours;
panels, Salariés, fiche, Feuille d'heures, Réserves, Coût chantiers, Exporter l'équipe, Réglages, congés,
habilitations, import CSV; then the live chain: Karim « Je commence » → « J'ai fini » (toast « Pointage fermé —
07:30 à 12:00 », 2 positions) → photo (« Photo 1 — 24/09/2026 », bytes served back) → « Envoyer ma journée » →
bureau « Corriger les heures » → « Corriger et prévenir » (« le salarié est prévenu ») → « Lever la réserve » →
« CSV pour la paie » (download parsed: `Matricule;Nom;Prenom;…;Total heures`, line 00042 Benali, lines locked) →
Karim sees « Le bureau a corrigé » + « Chez le comptable » → s6 « Clôture du mois » (« septembre 2026 clôturé »).
Last run output: `smoke/last-run.txt`.

## Known gaps / caveats

- Not a SQL engine: only the query features the app uses (anything else → 501, flagged). No realtime (the app has none).
- JWTs are unsigned; any password works for the demo e-mails; `/sb/auth/v1/signup` and invitation/recovery links are not emulated (501).
- Budgets are recalibrated per scene, so the budget hours of a chantier differ slightly between s1 and s6 (the % shown
  right after a reset is always the target). In a LIVE chain without reset (e.g. s3a → Karim sends his day → Coût
  chantiers) the chantiers that just received hours move up (Villa Martin 84 → 87 %, Les Cèdres 76 → 78 %): reset to
  `s5` before filming Coût chantiers.
- `exported_at` and `decided_at` are written by the browser (page clock), as in production; everything the database would stamp uses the demo clock.
- A disk-backed file given to `setInputFiles(path)` reaches a `route.fetch` proxy with its multipart part EMPTY
  (Chromium does not expose file-backed bodies to interception). The storage upload therefore substitutes the bytes of
  the file of the same name in `../assets` (`photos/`, `docs/`, `brand/`, root) when the part is empty — so
  `setInputFiles('…/assets/photos/chantier-01.jpg')` through the capture proxy stores the real 231 kB JPEG (log note
  `empty part "chantier-01.jpg" (proxied disk file) → assets/photos/chantier-01.jpg`). A file that is not in `../assets`
  still arrives empty (flag `empty-upload`): hand it as `{name, mimeType, buffer}` instead.
- On `/poseur` the FIRST `input[type=file][accept^="image"]` in the DOM is the profile-photo input (« Changer ma photo »,
  bucket `worker-photos` + `update_my_photo`), not the Documents one. For « Documents » → « Photo » use
  `[role="dialog"] input[type=file][capture]`.
- `stop_active_session` / `active_sessions.started_at` use the demo clock at the moment of the tap: to read « Commencé à
  07:30 » and « Endroit noté : départ 07:30 », tap « Je commence » at ≥ 07:30:00 demo time (07:29:31 gives « départ 07:29 »
  while the line itself is rounded to 07:30).
- At 390 px the chef's « Mon équipe aujourd'hui » row truncates « Thomas Petit » to « T.. » (app layout, not data).
- Only one office account (as specified), so « Salariés » shows the app's « Une seule personne a l'accès bureau » hint.
