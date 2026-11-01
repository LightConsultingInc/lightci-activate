# Performance baselines

k6 scripts that back the sizing table in the self-host guide (test plan T2.9 and T5.9).

```bash
brew install k6
./scripts/dev.sh mock                        # API on :4310 with deterministic AI
k6 run perf/learner-load.js                  # 50 browsing learners, 5 submitting, 2 minutes
BROWSERS=200 SUBMITTERS=20 DURATION=15m k6 run perf/learner-load.js
```

Point `API_URL` at a cell to measure it from outside; the script signs in through WorkOS with the
demo learner unless `EMAIL`/`PASSWORD` say otherwise.

Thresholds: reads p95 under 500 ms, submissions under 60 s at p95, under 1% failed requests. A run
that misses a threshold exits non-zero. Record results in `docs/self-hosting-plan.md` next to the
sizing table whenever the profile or the infrastructure changes.
