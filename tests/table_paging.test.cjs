const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleUnderTest = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('src/lib/table_paging.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInThisContext(`(function(module,exports){${code}\n})`)(moduleUnderTest, moduleUnderTest.exports);
const { rowsForTableHeight, pageForTableSize, cappedPageWindow } = moduleUnderTest.exports;

test('table height leaves room for header, pagination and scrollbar and respects the API cap', () => {
  assert.equal(rowsForTableHeight(394), 10);
  assert.equal(rowsForTableHeight(699), 20);
  assert.equal(rowsForTableHeight(40), 1);
  assert.equal(rowsForTableHeight(10000), 100);
});

test('resizing keeps the old first row on the new page and query changes reset paging', () => {
  const state = { key: 'search=pasig&ps=10', page: 5 };
  assert.equal(pageForTableSize(state, 'search=pasig', 20), 3);
  assert.equal(pageForTableSize(state, 'search=pasig', 7), 6);
  assert.equal(pageForTableSize(state, 'search=manila', 20), 1);
  assert.equal(pageForTableSize({ key: '', page: 1 }, 'search=pasig', 20), 1);
});

test('non-divisible page sizes reach the browsing cap without returning extra records', () => {
  assert.deepEqual(cappedPageWindow(59, 17, 1000), { page: 59, offset: 986, limit: 14 });
  assert.deepEqual(cappedPageWindow(900, 17, 1000), { page: 59, offset: 986, limit: 14 });
  assert.deepEqual(cappedPageWindow(1, 17, 1000), { page: 1, offset: 0, limit: 17 });
  assert.deepEqual(cappedPageWindow(0, 10, 1000), { page: 1, offset: 0, limit: 10 });
});
