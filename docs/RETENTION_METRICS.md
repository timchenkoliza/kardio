# Retention metric contract

The portal is judged by whether physicians reach useful value, do meaningful tasks, have a reason to return and actually return. Code: `lib/portal/metrics.ts` (event names, report), `server/portal/telemetry.ts` (recording), `npm run portal:metrics` (report from `analytics_events`).

No success thresholds are defined: none were supplied, and inventing them would make the report look decisive without evidence.

## Unit and privacy

- Unit: anonymous session cookie (180 days, per browser). Without a database the id is adopted across serverless instances so it stays stable. Cross-device users count as several sessions until accounts exist.
- Payloads carry specialty, job, capability, result kind, ids, counts, length bucket and timings. Never query text, uploaded content or free-form input.

## Events

| Group | Event | Recorded when |
| --- | --- | --- |
| Activation | `portal_opened` | Home loaded (server, via `recordVisit`) |
| | `primary_intent_submitted` | Physician submits the input (length bucket, explicit job flag) |
| | `intent_routed` | Router chose a job (job, capability, router confidence) |
| | `useful_result_rendered` | Result page shows at least one source-supported finding |
| | `first_value_delivered` | First such result for the specialty profile (with `ttfvMs`) |
| Utility | `source_opened`, `result_saved`, `followup_started` | Source link, save, «Что дальше»/follow-up input |
| | `drug_result_opened`, `guideline_result_opened`, `research_result_completed` | Job result rendered / research run with findings |
| | `event_opened`, `event_registration_clicked`, `learning_recommendation_opened` | Clicks on the respective cards |
| Personalisation | `specialty_signal_used`, `topic_signal_added`, `recommendation_reason_shown` | Feed or step built from specialty only / topic chosen / reasons rendered |
| Return | `return_session` | Visit more than 30 minutes after the previous one (`daysSinceFirst`) |
| | `repeat_job` | Same job asked again by the session |
| | `update_opened_since_previous_session` | A card flagged «Новое» opened |

## Report (`computePortalRetention`)

- **Cohort** — session by UTC day of its first event.
- **Activation rate** — sessions with `first_value_delivered` / sessions.
- **D1 / D7 / D14** — share of eligible sessions with any event on day N or later after the first day. Sessions younger than N days are excluded, not counted as churn.
- **Cohorts** — by specialty, and by the job of the first useful result (`no_value_yet` for unactivated sessions).
- **Repeat useful task** — sessions with a useful action on two or more distinct days.
- **Time to first value** — p50 / p90 of `ttfvMs`.

## Reading it

Compare D7 across first-job cohorts: if `drug` and `answer` cohorts return and `research` does not, the homepage hierarchy is right; if «Для вас» drives most `return_session` events with `update_opened_since_previous_session`, the return loop works. The opportunity map (`docs/PRODUCT_OPPORTUNITY_MAP.md`) should be re-scored from these cohorts instead of PBZ frequencies once there are a few hundred activated sessions.
