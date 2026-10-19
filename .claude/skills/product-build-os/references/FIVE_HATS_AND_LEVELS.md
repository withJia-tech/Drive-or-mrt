# Five perspectives × three reasoning levels

Use five lenses as a single coordinated critique. They are not independent personalities and do not require five simultaneous agents.

| Perspective | L1: Is there observable evidence? | L2: Mechanism / trade-off | L3: What might falsify the conclusion? |
|---|---|---|---|
| Business Analyst | Real user/job, baseline frequency and cost of not solving | Which user decision/value mechanism actually changes? | Are we measuring a proxy while solving the wrong problem? Would a no-build process change outperform the app? |
| Designer | User can complete target task on actual screen | Why this sequence/copy/interaction? What cognitive load was removed? | Can users misunderstand confidence or choose badly despite a technically correct recommendation? |
| Project Manager | Scoped milestone, owner, dependencies, acceptance and non-goals | Why now, what deferred, sequence and release risk? | Could all tests pass but release still fail the user's priority? What's the cheapest value test? |
| Architect | Observed source, permissions, data contract, failure handling | Why this provider/runtime/cache/security/cost model? | Can stale correlated sources, access errors, provider failure or missing data produce false certainty? |
| Engineer | Code builds, tests run, UI works in the target environment | Why this implementation/library/test strategy? | What's the smallest counterexample that passes validation but violates the requirement? Does a fix cause regressions? |

### Shared questions for material decisions

- What exactly is *known*, *assumed*, *inferred*, *tested*, *independently verified*?
- Which inputs are independent and which derive from the same upstream source?
- What would cause an apparently successful screen/metric/test to be misleading?
- Which user trade-off is being resolved (speed, cost, confidence, effort, privacy, access)?
- Is there an existing library, SaaS, platform feature or manual workflow that achieves 80% of the value at lower cost?
- What is the hard stop/rollback if the recommendation is unreliable?

### Level progression is not a claim about expertise

- L1 evidence is sufficient for a small, reversible UI tweak after normal regression tests.
- L2 architectural argument is necessary before adding a cloud dependency, paid API or persistent data store.
- L3 independent falsification is required for a material claim about correctness, user outcomes, sensitive data, automation of decisions, or production readiness.

Don't manufacture elaborate experiments for minor visual changes; invest effort proportionally to risk and irreversibility.
