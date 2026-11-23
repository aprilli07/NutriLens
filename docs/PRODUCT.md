# NutriLens: product brief

## Problem

Kids with food allergies or strict diets (celiac, vegan households, peanut allergy) can't reliably read ingredient lists. Labels hide allergens behind words like *casein*, *semolina* or *albumen*, mix in "may contain" warnings, and in Canada are printed in two languages. Parents can't be there for every snack, so the child either asks an adult every time or guesses.

## Users

| User | Need | What NutriLens gives them |
|---|---|---|
| **Child (7–12)** | "Can I eat this?" in a few seconds, without reading the label | Scan → a green / yellow / red verdict and one sentence they can understand |
| **Parent** | Set the rules once and know what their child is eating | Family account with shared food rules; every scan from every device appears in History |

## Scope (v1)

In:
- Barcode scan and text search across the full Open Food Facts catalogue (4.9M+ products)
- 10 food rules: vegan, vegetarian, gluten-, dairy-, egg-, tree-nut-, peanut- and soy-free, low sugar, low salt
- Rule-based verdict that runs the same way everywhere (phone, server, search filter, evaluation)
- Family account: rules and scan history sync across devices
- Optional AI layer for kid-friendly explanations and alternatives. It can raise a warning but never clear one.

Out (deliberately):
- Push notifications to parents (History covers the need without asking for notification permission on a child's phone)
- Separate parent and child roles or PINs (one shared family login keeps setup to one step)
- Medical advice. The app always says to check the package for severe allergies.

## Key decisions

1. **Deterministic rules decide safety; AI only explains.** An LLM that sometimes says "safe" for a peanut product is unacceptable for this audience. Rules are testable and measurable; AI output is checked against them and can only make a result stricter.
2. **"Unknown" is a real answer.** If a product has no ingredient list, the app says it can't tell instead of guessing "good".
3. **"May contain" means caution, not avoid.** Real ingredients are kept separate from shared-facility warnings, because families differ in how much trace risk they accept. A caution sends the child to a grown-up instead of hiding the product.
4. **Own index instead of calling the Open Food Facts search API.** The public search API takes seconds and has no typo tolerance or dietary filters. Importing the dump into MySQL gives fast typo-tolerant search with filters computed ahead of time.

## Success metrics

| Metric | Target | How it's measured | Current |
|---|---|---|---|
| Verdict accuracy on real products | ≥ 90% | `npm run eval`: random product–restriction pairs, ground truth from OFF allergen data and labels | **97.0%** on 2,000 held-out pairs ([report](../eval/REPORT.md)) |
| Allergen recall (contains → flagged) | ≥ 95% | Same eval, "Flagged" column | **98.0%** |
| Search latency | p95 < 200 ms | `npm run bench:search`: 1,000 generated queries over HTTP | **p95 34 ms**, 99.7% under 200 ms ([results](../eval/search-benchmark.json)) |
| Barcode coverage | ≥ 90% of scans found | Local DB plus live Open Food Facts fallback | not measured yet (needs real usage) |

## Risks

- **Crowd-sourced data can be wrong or stale.** Mitigation: every scan checks the live record and merges it with the stored copy without dropping a warning, a product name is used when the ingredient list is missing or unreadable, "unknown" is a real verdict, and the app reminds families to check the package.
- **Unusual ingredient names.** Mitigation: the term list is covered by unit tests, and eval errors are reviewed to grow it.
- **AI cost and latency.** Mitigation: AI is optional, cached per product and rule set, has a 10 s timeout, and the app works fully without it.
