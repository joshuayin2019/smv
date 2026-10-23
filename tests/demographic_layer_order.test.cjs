const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleUnderTest = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('src/lib/demographic_layer_order.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInThisContext(`(function(module, exports) { ${code}\n})`)(moduleUnderTest, moduleUnderTest.exports);
const { arrangeDemographicLayers } = moduleUnderTest.exports;

function fakeMap(initial) {
  let ids = [...initial], moves = 0;
  const map = {
    getLayersOrder: () => [...ids],
    moveLayer: (id, before) => {
      assert.ok(++moves < 100, 'layer ordering must converge');
      ids = ids.filter(value => value !== id);
      ids.splice(before ? ids.indexOf(before) : ids.length, 0, id);
      // Simulate synchronous styledata callbacks from all five mounted components.
      for (let i = 0; i < 5; i++) arrangeDemographicLayers(map);
    },
    add: id => ids.push(id),
    moves: () => moves,
  };
  return map;
}

test('five demographic handlers converge and subsequent page changes do not reorder layers', () => {
  const map = fakeMap(['base', 'population-fill', 'smv-line', 'poi-icons',
    'type_of_buildings-label', 'year_built-line', 'population-label', 'year_built-fill', 'number_of_story-line', 'number_of_story-fill', 'barangay_class-fill', 'barangay_class-line']);
  arrangeDemographicLayers(map);
  assert.deepEqual(map.getLayersOrder(), ['base', 'population-fill', 'population-label',
    'year_built-fill', 'year_built-line', 'type_of_buildings-label', 'number_of_story-fill', 'number_of_story-line', 'barangay_class-fill', 'barangay_class-line', 'smv-line', 'poi-icons']);
  const moves = map.moves();
  for (let i = 0; i < 30; i++) arrangeDemographicLayers(map);
  assert.equal(map.moves(), moves);
});

test('late hover layers join the correct group and maps without SMV remain stable', () => {
  const map = fakeMap(['base', 'year_built-fill', 'year_built-line']);
  arrangeDemographicLayers(map);
  map.add('year_built-hover-fill');
  arrangeDemographicLayers(map);
  assert.deepEqual(map.getLayersOrder(), ['base', 'year_built-fill', 'year_built-hover-fill', 'year_built-line']);
  const moves = map.moves();
  arrangeDemographicLayers(map);
  assert.equal(map.moves(), moves);
});
