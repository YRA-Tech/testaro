/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  serializedDiff
  Checks that converting a file to TypeScript leaves unchanged every function that the file sends into a page to run there (issue #73, docs/typescript-phase-4-plan.md).

  Usage: node validation/executors/serializedDiff [--base <git ref>] [--head <git ref>] <file.js> ...

  Playwright serializes a function given to page.evaluate, page.evaluateHandle, page.$eval, page.$$eval, locator.evaluate, locator.evaluateAll, page.addInitScript or page.waitForFunction, and runs its text in the page, as does code that calls toString() on a function. Such a function must not refer to anything outside itself. tsc rewrites the calls of imported functions as (0, module_1.f)(…), which inside a serialized function would throw in the page, and rewrites references to exported names as exports.name.

  For each file, the tool finds the serialized functions of the base version (default origin/main; the hand-written original) and of the working-tree version, or the head ref if one is given (the emitted file): functions given inline to those methods, functions they are given by name, and functions whose toString() is called. It compares them in order, token by token (comments and whitespace are not tokens), and reports any emitted serialized function that refers to exports, require, module, or a tsc module alias (x_1). The exit code is 1 if the functions differ in number or text or if any such reference is found.
*/

// IMPORTS

const {execFileSync} = require('child_process');
const fs = require('fs');
const acorn = require('acorn');
const {diffArrays} = require('diff');

// CONSTANTS

const serializingMethods = new Set([
  'evaluate', 'evaluateHandle', '$eval', '$$eval', 'evaluateAll', 'addInitScript', 'waitForFunction'
]);
const isFunctionNode = node => node && [
  'ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'
].includes(node.type);
// Names that a serialized function in emitted code must not refer to.
const isModuleBinding = name => ['exports', 'require', 'module'].includes(name) || /_\d+$/.test(name);

// FUNCTIONS

const show = (ref, file) => execFileSync(
  'git', ['show', `${ref}:${file}`], {encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore']}
);
// Calls a visitor on every node of a syntax tree, depth first, in source order.
const walk = (node, visit) => {
  if (! node || typeof node.type !== 'string') {
    return;
  }
  visit(node);
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      value.forEach(child => walk(child, visit));
    }
    else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
};
// Returns the name a member expression or identifier refers to (exports.f and f both give f).
const referredName = node => {
  if (node?.type === 'Identifier') {
    return node.name;
  }
  if (
    node?.type === 'MemberExpression' && ! node.computed && node.object.type === 'Identifier'
    && node.object.name === 'exports'
  ) {
    return node.property.name;
  }
  return null;
};
// Returns the serialized functions of a source, in source order, as {line, how, node, text}.
const getSerialized = source => {
  const tree = acorn.parse(source, {
    ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true,
    allowReturnOutsideFunction: true, locations: true
  });
  // Map the names of functions declared or assigned anywhere to their nodes.
  const named = new Map();
  walk(tree, node => {
    if (node.type === 'FunctionDeclaration' && node.id) {
      named.set(node.id.name, node);
    }
    else if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && isFunctionNode(node.init)) {
      named.set(node.id.name, node.init);
    }
    else if (node.type === 'AssignmentExpression' && isFunctionNode(node.right)) {
      const name = referredName(node.left);
      if (name) {
        named.set(name, node.right);
      }
    }
  });
  const found = [];
  const add = (node, how) => {
    const fn = isFunctionNode(node) ? node : named.get(referredName(node));
    if (fn && ! found.some(item => item.node === fn)) {
      found.push({line: fn.loc.start.line, how, node: fn, text: source.slice(fn.start, fn.end)});
    }
  };
  walk(tree, node => {
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.computed) {
      return;
    }
    const method = node.callee.property.name;
    if (serializingMethods.has(method)) {
      // The function is the first argument, or the second for $eval and $$eval.
      const index = ['$eval', '$$eval'].includes(method) ? 1 : 0;
      add(node.arguments[index], method);
    }
    else if (method === 'toString' && ! node.arguments.length) {
      add(node.callee.object, 'toString');
    }
  });
  return found.sort((a, b) => a.node.start - b.node.start);
};
// Returns the token texts of a function's source, without the formatting differences of the emit (as in emitDiff): parentheses around a single arrow-function parameter, the longhand {a: a} of a shorthand property, and a semicolon before a closing brace.
const tokenTexts = text => {
  const raw = [];
  const wrapped = `(${text})`;
  for (const token of acorn.tokenizer(wrapped, {ecmaVersion: 'latest'})) {
    raw.push(token.type.label === 'string' ? JSON.stringify(token.value) : wrapped.slice(token.start, token.end));
  }
  const isName = item => /^[A-Za-z_$][\w$]*$/.test(item || '');
  const texts = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '(' && isName(raw[i + 1]) && raw[i + 2] === ')' && raw[i + 3] === '=>') {
      texts.push(raw[i + 1]);
      i += 2;
    }
    else if (
      ['{', ','].includes(texts.at(-1)) && isName(raw[i]) && raw[i + 1] === ':'
      && raw[i + 2] === raw[i] && [',', '}'].includes(raw[i + 3])
    ) {
      texts.push(raw[i]);
      i += 2;
    }
    else if (! (raw[i] === ';' && raw[i + 1] === '}')) {
      texts.push(raw[i]);
    }
  }
  return texts;
};
// Returns the free identifiers of a function that are module bindings.
const moduleReferences = fn => {
  const names = new Set();
  walk(fn.body, node => {
    if (node.type === 'Identifier' && isModuleBinding(node.name)) {
      names.add(node.name);
    }
  });
  return [...names];
};
// Checks one file and returns whether it passes.
const check = (file, base, head) => {
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
  const before = getSerialized(original);
  const after = getSerialized(emitted);
  let ok = true;
  if (before.length !== after.length) {
    ok = false;
    console.log(`${file}: ${before.length} serialized function(s) in the original, ${after.length} in the emitted file`);
  }
  const count = Math.min(before.length, after.length);
  for (let i = 0; i < count; i++) {
    const a = tokenTexts(before[i].text);
    const b = tokenTexts(after[i].text);
    if (a.join(' ') !== b.join(' ')) {
      ok = false;
      console.log(`${file}: serialized function ${i + 1} (${after[i].how}, original line ${before[i].line}, emitted line ${after[i].line}) differs`);
      // Show each changed run of tokens with a few tokens of context.
      let index = 0;
      diffArrays(a, b).forEach(part => {
        if (part.removed || part.added) {
          const context = a.slice(Math.max(0, index - 6), index).join(' ');
          console.log(`    … ${context}\n  ${part.removed ? '-' : '+'} ${part.value.join(' ')}`);
        }
        if (! part.added) {
          index += part.count;
        }
      });
    }
  }
  after.forEach((item, i) => {
    const references = moduleReferences(item.node);
    if (references.length) {
      ok = false;
      console.log(`${file}: serialized function ${i + 1} (${item.how}, emitted line ${item.line}) refers to ${references.join(', ')}, which do not exist in the page`);
    }
  });
  console.log(`${file}: ${after.length} serialized function(s), ${ok ? 'unchanged' : 'CHANGED'}`);
  return ok;
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
  console.log('Usage: node validation/executors/serializedDiff [--base <git ref>] [--head <git ref>] <file.js> ...');
  process.exit(2);
}
const results = args.map(file => check(file, base, head));
process.exit(results.every(Boolean) ? 0 : 1);
