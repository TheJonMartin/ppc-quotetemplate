# Decisions

Recorded 2026-10-15 (Jon Martin).

| # | Decision |
|---|---|
| Target portal | Process Pro Consulting, portal 5192758. This overrides v2 hard rule 1. Every quote is a test quote for now. Confirm before each production write. |
| Default hours | Tier midpoint, rounded half up: `round((hours_low + hours_high) / 2)`. Stored as `hours_default` in `ppc_module_tiers`. The rep can edit quantity on the line. |
| PM rounding | Nearest hour, halves up. 15% of the workstream's one-time module hours. |
| Portal Customization | Has no tiers. Tiers or hours will be added to the service menu. Until then it cannot be priced from hours. |
| Managed Marketing Operations | In no workstream. Left off quotes. No product is created for it. |
| Draft workstreams | All 12 are Draft and are quotable. |
| Property values | HubSpot stores the label as the value for `ppc_tier`, `ppc_module_role`, `ppc_module_family` and `ppc_5c_stage`. Compare these case-insensitively. |
| 5C property | `ppc_5c_stage` (not `ppc_five_c`). |

## Sample engagement (v2 section 6) under these decisions

v2's expected totals (310 hours, $69,750) assume `hours_high`. With midpoint hours the same sample is:

| Line | Hours | Amount |
|---|---|---|
| Client Onboarding | 13 | $2,925 |
| Sales Hub Launch (149 + 22 PM) | 171 | $38,475 |
| Quoting & CPQ (47 + 7 PM) | 54 | $12,150 |
| One-time total | 238 | $53,550 |
| Ongoing RevOps Support, Essential midpoint | 25/mo | $5,625/mo |

Removing Lead Management leaves Sales Hub Launch at 111 module hours and a 17-hour PM line (16.65 rounded up).
`build/report.json` holds the full calculation, including the `hours_high` comparison.
