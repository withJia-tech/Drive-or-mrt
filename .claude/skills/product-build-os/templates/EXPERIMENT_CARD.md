# Experiment [ID] — [counterexample / research question]

- **Claim to test:** `[falsifiable, precise]`
- **Status:** `PLANNED / EXECUTED / INCONCLUSIVE / REFUTED / SUPPORTED WITHIN SCOPE`
- **Observed or hypothetical?:** `[do not conflate]`
- **Source of truth:** `[what independent reference establishes correctness and who verified it?]`
- **Shared failure risk:** `[do test input and reference derive from same data/model/provider?]`

## Hypothesis / controls

| Condition | Test data | Predicted result before execution | Actual result / evidence after execution |
|---|---|---|---|
| Positive control | Correct input/reference | `[expected]` | `[command, result]` |
| Negative control | Known detectable wrong result | `[expected]` | `[command, result]` |
| Adversarial case | Smallest misleading pass | `[expected]` | `[command, result]` |
| Corrected case (if implemented) | Fix plus regressions | `[expected]` | `[command, result]` |

## Interpretation

Observed: `[specific result under exact conditions]`.
Explains: `[mechanism / root cause vs environment]`.
Does **not** prove: `[limits, untested environments, potential confounds]`.
Next cheapest discriminating experiment: `[one test]`.

## Reproducibility

Repo/commit: `[sha]`; environment: `[OS, runtime, version]`; command: `[copyable]`; exit code: `[value]`; screenshot/log: `[path]`; whether real/synthetic data: `[classification]`.
