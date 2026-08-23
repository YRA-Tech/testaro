# Retired validation fixtures

The job-properties files in this directory validated Testaro rules that the rule registry in
`tests/testaro.js` no longer contains. They are kept, rather than deleted, because the expectations
they state are a record of the behavior that was once required, and because some of them can be
adapted to the rules that superseded them.

None of them is executable as it stands: `npm test <ruleID>` reads only
`validation/tests/jobProperties`, and each of these files names a rule that no tool would run.

| File | Rule it validated | Successor |
| ---- | ----------------- | --------- |
| `focOp.json` | `focOp` | `focAndOp`, which merged `focOp` and `opFoc` |
| `opFoc.json` | `opFoc` | `focAndOp`, which merged `focOp` and `opFoc` |
| `targetTiny.json` | `targetTiny` | `targetsNear`, validated by `jobProperties/targetsNear.json` |
| `linkTitle.json` | `linkTitle` | none |

The targets that these fixtures load are still in `validation/tests/targets`, so adapting one of
them requires only rewriting its `rule` property, its `rules` arrays, and its expectations.

## License

© 2026 Jonathan Robert Pool.

Licensed under the [MIT License](https://opensource.org/license/mit/). See [LICENSE](../../../LICENSE) file
at the project root for details.

SPDX-License-Identifier: MIT
