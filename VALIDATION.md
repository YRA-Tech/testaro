# Validation

## Introduction

Testing the correctness of Testaro is named “validation” rather than “testing”, for confusion avoidance.

The original strategy for validation is to permit any test act to contain an `expect` property, whose value specifies a fact about the result. The specification language is a custom Testaro-specific language. When an act in a job has an `expect` property, then the act in the corresponding report contains an `expectations` property that describes the success or failure of the result to conform to the specification.

In practice, no use of the `expect`/`expectations` pattern is known except for test acts whose tool is `testaro`. The other tools are treated as black boxes with no contracts entitling Testaro to hold the tools accountable for compliance. Thus, the pattern has been used for the validation of the tests of the `testaro` tool.

It may be appropriate to replace the pattern with a conventional testing approach that is widely practiced and understood, based on a platform such as Vitest and/or Playwright. While such a replacement is being considered, the documentation on the pattern that has been part of the `README.md` file is moved into this document. Here it is named “classic validation”.

## Classic validation

### Expectations

Any `test` act can contain an `expect` property. If it does, the value of that property must be an array of arrays. Each array specifies expectations about the results of the operation of the tool.

For example, a `test` act might have this `expect` property:

```javaScript
'expect': [
  ['standardResult.totals.0', '=', 0],
  ['standardResult.instances.length', '=', 0]
]
```

That would state the expectations that the `standardResult` property of the act will report no rule violations at severity level 0 and no instances of rule violations.

The first item in each array is an identifier of a property of the act. The item has the format of a string with `.` delimiters. Each `.`-delimited segment its the name of the next property in the hierarchy. If the current object is an array, the next segment must be a non-negative integer, representing the index of an element of the array.

If there is only 1 item in an array, it states the expectation that the specified property does not exist. Otherwise, there are 3 items in the array.

The second item in each array, if there are 3 items, is an operator, drawn from:

- `<`: less than
- `=`: equal to
- `>`: greater than
- `!`: unequal to
- `i`: includes
- `e`: equivalent to (parsed identically as JSON)

The third item in each array, if there are 3 items in the array, is the criterion with which the value of the first property is compared.

#### Facts about the element of an instance

A standard instance does not repeat the tag name, text, ID, and location of the element it reports. It identifies that element with a `catalogIndex`, which is a key into the `catalog` of the report, where those facts are held once per element rather than once per violation.

Therefore an expectation about the element is stated through a `catalogEntry` segment, which the validator resolves by looking the `catalogIndex` of the instance up in the catalog:

```javaScript
'expect': [
  ['standardResult.instances.0.catalogEntry.tagName', '=', 'HR'],
  ['standardResult.instances.0.catalogEntry.id', '=', 'mainRule'],
  ['standardResult.instances.0.catalogEntry.text', 'i', 'a substring of the text'],
  ['standardResult.instances.0.catalogEntry.box.height', '>', 0]
]
```

A catalog entry has the properties `tagName`, `id`, `startTag`, `text`, `textLinkable`, `boxID`, `pathID`, and `headingIndex`. In addition, the validator adds a `box` property, parsing the `x:y:width:height` of the `boxID`, so that an expectation can state a fact about one dimension of the element.

Two cautions:

- `text` is the entire text of the element, whereas the former `excerpt` property of an instance was an excerpt of it, so `i` is usually the appropriate operator.
- The catalog describes the target of the job, which the validator makes the target of the first `launch` act of the fixture. An element on a page that a later `url` act visits is not in the catalog, so its entry holds only a `pathID` and a `tagName`, both derived from the XPath that the rule reported.

A typical use for an `expect` property is checking the correctness of a Testaro test. Thus, the validation jobs in the `validation/tests/jobs` directory all contain `test` acts with `expect` properties. See the “Validation” section below.

### Validators

Testaro and the tests of the Testaro tool can be validated with the _executors_ located in the `validation/executors` directory.

The executor for a single test is `test`. To execute it for any test `xyz`, call it with the statement `npm test xyz`.

The other executors are:

- `run`: validates immediate test execution
- `dirWatch`: validates directory watching
- `netWatch`: validates network watching
- `tests`: validates all the Testaro tests
- `checkFixtures`: statically checks the validation fixtures, without running a browser
- `acts`: validates the control-flow act types, which no rule fixture exercises

To execute any executor `xyz` among these, call it with the statement `npm run xyz`.

The `tests` executor validates the rules that the `allRules` registry in `tests/testaro.js` lists, rather than the rules that the names of the files in the `testaro` directory suggest, because that directory also contains TypeScript sources and declaration files. To validate only some rules, name them: `npm run tests -- focInd allCaps`.

Each executor makes use of the job-properties files in the `validation/tests/jobProperties` directory, and they, in turn, run tests on HTML files in the `validation/tests/targets` directory. The name of each job-properties file is the ID of the rule it validates, and its `rule` property must be identical to that name.

### Exit statuses

Every executor exits with status 0 only if the validation succeeded, and with a nonzero status otherwise. Therefore, an executor can gate a commit or a continuous-integration workflow.

A validation performed by the `test` or `tests` executor fails if any of these is true:

- The job-properties file of the rule is missing, unparsable, or without a test act that states an expectation.
- Performing the job threw an error.
- The job was aborted, for example because no browser could be launched or the target could not be loaded.
- Any test act was prevented, so that its expectations were never evaluated.
- Any expectation was not satisfied.

A failure is reported as a list of one-line descriptions. To make the executor also print the failing acts in their entirety, set the `TESTARO_VALIDATION_VERBOSE` environment variable to `true`.

### Static checks of the fixtures

The `checkFixtures` executor runs no browser and performs no job, so it takes about a second and its result does not depend on the environment. It reports these defects as errors:

- A job-properties file whose `rule` property differs from its file name.
- A job-properties file, or a `rules` array in a test act, that names a rule absent from the registry in `tests/testaro.js`.
- A `file://` target that does not exist. The check is case-sensitive on every path segment, so a fixture that works on a case-insensitive file system, such as those of macOS and Windows, but would fail on the case-sensitive file system of the Linux runner that performs continuous integration, is reported.
- A test act with no `expect` array, since such an act can never fail.
- An expectation that is not an array of 1 or 3 items, whose property path is not a nonempty string, or whose operator is not one that `isTrue()` in `procs/doActs.js` implements.

It reports a registered rule that no job-properties file validates as a warning, which does not affect the exit status.

### Environment variables

| Variable | Effect |
| -------- | ------ |
| `TESTARO_VALIDATION_BROWSER` | Browser to validate with, overriding the default `webkit` |
| `TESTARO_VALIDATION_VERBOSE` | If `true`, print the failing acts in full |
| `TESTARO_VALIDATION_TIMELIMIT` | Seconds after which the `dirWatch` executor gives up, default 600 |

### Validation of act types

The rule fixtures perform only `launch`, `url`, and `test` acts, so the behavior of the other act types was never validated. That is how the `next` act came to be broken in four ways at once without anything reporting it.

`npm run acts` fills that gap. Each file in `validation/tests/acts` contains the `acts` array of a job, and `validation/executors/acts.js` maps its name to a function that checks the performed job. `next.json` requires a `next` act to jump by a count and to a named act, the acts that each jump passes over not to be performed, and the named act to be performed.

### Retired fixtures

`validation/tests/retired` holds the job-properties files of rules that the registry no longer contains. They are not executable, and the `checkFixtures` executor ignores them. See the `README.md` file in that directory.

### Validation in Windows PowerShell

1. Install project dependencies

    ```powershell
    npm install
    ```

1. Install Playwright browsers (required)

    ```powershell
    npx playwright install
    ```

1. Run a validation for a specific rule (example: `altScheme`)

```powershell
npm test altScheme
```

Notes:

- If a validator job is stored under `validation/tests/jobProperties/pending`, copy it to `validation/tests/jobProperties/` or run the validator via the provided filenames. `altScheme` was copied already.
- If a test fails its expectations, read the JSON output printed by the validation harness for `standardResult` and `expectations` to identify missing instances.
- After making changes to rule implementations in `testaro/`, re-run the specific `npm test <ruleID>` until the validator reports success.

Preparing a PR:

- Create a branch (example `feature/add-training-rules`), commit your changes, push to remote, and open a PR describing which rules are training vs clean-room.

## License

© 2021–2025 CVS Health and/or one of its affiliates. All rights reserved.
© 2025–2026 Jonathan Robert Pool.

Licensed under the [MIT License](https://opensource.org/license/mit/). See [LICENSE](../../LICENSE) file
at the project root for details.

SPDX-License-Identifier: MIT
