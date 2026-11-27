/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  emitDiff
  Compares the JavaScript that tsc emits for a converted file with the hand-written JavaScript it replaces, token by token, so a conversion to TypeScript can be shown to change nothing but types (issue #73, docs/typescript-phase-4-plan.md).

  Usage: node validation/executors/emitDiff [--base <git ref>] [--head <git ref>] <file.js> ...

  Each file is compared as it is in the working tree, or at the head ref if one is given (the emitted file), with the same path at the base ref (default origin/main; the hand-written original). Comments and whitespace are ignored, because they are not tokens. Before comparing, both token streams are normalized to remove what tsc's CommonJS emit adds without changing behavior:
  - the "use strict" prologue, the __esModule marker, the `exports.a = exports.b = void 0` hoist, and `exports.f = f` assignments;
  - tsc's interop helpers (__importStar, __importDefault and those they use);
  - require statements, which are compared separately as a list of module specifiers;
  - module aliases: `(0, x_1.name)` and `x_1.name` become `name`, and so do `exports.name` and `(0, exports.name)`;
  - `const` before an exported name, and the doubled `name = name =` that the original's `const name = exports.name =` becomes.
  Every difference that remains is printed, and the exit code is 1. Parentheses left by erased type assertions are expected to remain; each remaining difference is to be explained in the pull request.
*/

// IMPORTS

const {execFileSync} = require('child_process');
const fs = require('fs');
const acorn = require('acorn');
const {diffArrays} = require('diff');

// CONSTANTS

const helperNames = new Set([
  '__createBinding', '__setModuleDefault', '__importStar', '__importDefault', '__exportStar'
]);
// Tokens of context shown around each difference.
const context = 6;

// FUNCTIONS

// Returns the tokens of a script, as [text, line] pairs.
const tokenize = source => {
  const tokens = [];
  for (const token of acorn.tokenizer(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowHashBang: true,
    allowReturnOutsideFunction: true,
    locations: true
  })) {
    const text = token.type.label === 'string'
      ? JSON.stringify(token.value)
      : token.type.label === 'template'
        ? `\`${token.value}\``
        : source.slice(token.start, token.end);
    tokens.push([text, token.loc.start.line]);
  }
  return tokens;
};
// Returns the index after the statement starting at index i (at its top-level semicolon).
const statementEnd = (tokens, i) => {
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    const text = tokens[j][0];
    if (['(', '[', '{', '${'].includes(text)) {
      depth++;
    }
    else if ([')', ']', '}'].includes(text)) {
      depth--;
    }
    else if (text === ';' && depth === 0) {
      return j + 1;
    }
  }
  return tokens.length;
};
const texts = (tokens, i, n) => tokens.slice(i, i + n).map(token => token[0]).join(' ');
// Returns whether a name is a tsc module alias (x_1) or exports.
const isAlias = (name, aliases) => name === 'exports' || aliases.has(name);
// Normalizes the tokens of a file and returns them with its required module specifiers.
const normalize = tokens => {
  const requires = [];
  const aliases = new Set();
  const exported = new Set();
  // Find the module aliases and the exported names.
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i][0] === 'exports' && tokens[i + 1][0] === '.') {
      exported.add(tokens[i + 2][0]);
    }
    if (
      ['const', 'let', 'var'].includes(tokens[i][0]) && /_\d+$/.test(tokens[i + 1][0])
      && tokens[i + 2][0] === '='
    ) {
      aliases.add(tokens[i + 1][0]);
    }
  }
  // Remove the statements that the emit adds and record the requires.
  const kept = [];
  for (let i = 0; i < tokens.length;) {
    const start = texts(tokens, i, 5);
    const end = statementEnd(tokens, i);
    const statement = tokens.slice(i, end).map(token => token[0]);
    const requireAt = statement.indexOf('require');
    const isStatementStart = i === 0 || [';', '{', '}'].includes(tokens[i - 1][0]);
    if (
      isStatementStart && (
        // The "use strict" prologue.
        (i === 0 && /^"use strict"/.test(start))
        // The __esModule marker.
        || start.startsWith('Object . defineProperty ( exports')
        // The void 0 hoist of exported names.
        || (statement[0] === 'exports' && statement.slice(-2).join(' ') === '0 ;'
          && statement.includes('void'))
        // An exports.f = f assignment.
        || (statement.length === 6 && statement[0] === 'exports' && statement[3] === '='
          && statement[2] === statement[4])
        // A tsc interop helper.
        || (['var', 'const'].includes(statement[0]) && helperNames.has(statement[1]))
      )
    ) {
      i = end;
      continue;
    }
    // A require statement.
    if (
      isStatementStart && ['const', 'let', 'var'].includes(statement[0]) && requireAt > 0
      && statement[requireAt + 1] === '(' && /^["'`]/.test(statement[requireAt + 2] || '')
      && statement.slice(requireAt + 3).every(text => [')', ';'].includes(text))
    ) {
      requires.push(statement[requireAt + 2].replace(/^["'`]|["'`]$/g, ''));
      i = end;
      continue;
    }
    kept.push(...tokens.slice(i, i + 1));
    i++;
  }
  // Rewrite module aliases and exported names.
  const out = [];
  for (let i = 0; i < kept.length; i++) {
    const [text] = kept[i];
    // (0, x_1.name) or (0, exports.name) becomes name.
    if (
      text === '(' && kept[i + 1]?.[0] === '0' && kept[i + 2]?.[0] === ','
      && isAlias(kept[i + 3]?.[0], aliases) && kept[i + 4]?.[0] === '.'
      && kept[i + 6]?.[0] === ')'
    ) {
      out.push(kept[i + 5]);
      i += 6;
      continue;
    }
    // x_1.name or exports.name becomes name (not after a dot, i.e. not a property access).
    if (
      isAlias(text, aliases) && kept[i + 1]?.[0] === '.' && kept[i - 1]?.[0] !== '.'
    ) {
      out.push(kept[i + 2]);
      i += 2;
      continue;
    }
    out.push(kept[i]);
  }
  // Remove const before an exported name and collapse name = name =.
  const final = [];
  for (let i = 0; i < out.length; i++) {
    const [text] = out[i];
    if (
      ['const', 'let', 'var'].includes(text) && exported.has(out[i + 1]?.[0])
      && out[i + 2]?.[0] === '='
    ) {
      continue;
    }
    if (
      exported.has(text) && out[i + 1]?.[0] === '=' && out[i + 2]?.[0] === text
      && out[i + 3]?.[0] === '='
    ) {
      i += 1;
      continue;
    }
    final.push(out[i]);
  }
  // Remove the formatting differences of the emit: parentheses around a single arrow-function parameter, the longhand {a: a} of a shorthand property, and a semicolon before a closing brace.
  const isName = text => /^[A-Za-z_$][\w$]*$/.test(text || '');
  const plain = [];
  for (let i = 0; i < final.length; i++) {
    const text = final[i][0];
    if (
      text === '(' && isName(final[i + 1]?.[0]) && final[i + 2]?.[0] === ')'
      && final[i + 3]?.[0] === '=>'
    ) {
      plain.push(final[i + 1]);
      i += 2;
      continue;
    }
    if (
      ['{', ','].includes(plain.at(-1)?.[0]) && isName(text) && final[i + 1]?.[0] === ':'
      && final[i + 2]?.[0] === text && [',', '}'].includes(final[i + 3]?.[0])
    ) {
      plain.push(final[i]);
      i += 2;
      continue;
    }
    if (text === ';' && final[i + 1]?.[0] === '}') {
      continue;
    }
    plain.push(final[i]);
  }
  return {tokens: plain, requires};
};
// Compares one file with its base version and returns whether they are equivalent.
const show = (ref, file) => execFileSync(
  'git', ['show', `${ref}:${file}`], {encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore']}
);
const compare = (file, base, head) => {
  let original;
  let emitted;
  try {
    original = show(base, file);
    emitted = head ? show(head, file) : fs.readFileSync(file, 'utf8');
  }
  catch {
    console.log(`${file}: not found at ${base}${head ? ` or ${head}` : ''}`);
    return false;
  }
  const a = normalize(tokenize(original));
  const b = normalize(tokenize(emitted));
  let same = true;
  const requiresA = [...a.requires].sort();
  const requiresB = [...b.requires].sort();
  if (JSON.stringify(requiresA) !== JSON.stringify(requiresB)) {
    same = false;
    console.log(`${file}: requires differ\n  - ${requiresA.join(', ')}\n  + ${requiresB.join(', ')}`);
  }
  const parts = diffArrays(a.tokens.map(token => token[0]), b.tokens.map(token => token[0]));
  let indexA = 0;
  let indexB = 0;
  let hunks = 0;
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    if (! part.added && ! part.removed) {
      indexA += part.count;
      indexB += part.count;
      continue;
    }
    same = false;
    hunks++;
    const removed = part.removed ? part.value : [];
    const added = part.removed && parts[p + 1]?.added ? parts[++p].value : part.added ? part.value : [];
    const lineA = a.tokens[indexA]?.[1] ?? a.tokens.at(-1)?.[1];
    const lineB = b.tokens[indexB]?.[1] ?? b.tokens.at(-1)?.[1];
    const before = b.tokens.slice(Math.max(0, indexB - context), indexB).map(token => token[0]).join(' ');
    const after = a.tokens.slice(indexA + removed.length, indexA + removed.length + context)
    .map(token => token[0]).join(' ');
    console.log(`${file}: original line ${lineA}, emitted line ${lineB}`);
    console.log(`    … ${before}`);
    if (removed.length) {
      console.log(`  - ${removed.join(' ')}`);
    }
    if (added.length) {
      console.log(`  + ${added.join(' ')}`);
    }
    console.log(`    ${after} …`);
    indexA += removed.length;
    indexB += added.length;
  }
  console.log(same ? `${file}: equivalent` : `${file}: ${hunks} difference(s)`);
  return same;
};

// OPERATION

const args = process.argv.slice(2);
// Removes an option and its value from the arguments and returns the value.
const takeOption = (name, defaultValue) => {
  const index = args.indexOf(name);
  if (index === -1) {
    return defaultValue;
  }
  const [, value] = args.splice(index, 2);
  return value;
};
const base = takeOption('--base', 'origin/main');
const head = takeOption('--head', '');
if (! args.length) {
  console.log('Usage: node validation/executors/emitDiff [--base <git ref>] [--head <git ref>] <file.js> ...');
  process.exit(2);
}
const results = args.map(file => compare(file, base, head));
process.exit(results.every(Boolean) ? 0 : 1);
