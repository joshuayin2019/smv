import type { Map } from 'maplibre-gl';

const ordering = new WeakSet<Map>();
const DEMOGRAPHIC_ORDER = ['population', 'year_built', 'type_of_buildings', 'number_of_story', 'barangay_class'].flatMap(prefix =>
  ['fill', 'hover-fill', 'boundary-halo', 'line', 'sel-fill', 'sel-line', 'label'].map(suffix => `${prefix}-${suffix}`)
);

// All demographic components share one order. Independent "immediately below SMV"
// handlers otherwise compete indefinitely when more than one source is mounted.
export function arrangeDemographicLayers(map: Map) {
  if (ordering.has(map)) return;
  const ids = map.getLayersOrder();
  const layers = DEMOGRAPHIC_ORDER.filter(id => ids.includes(id));
  if (!layers.length) return;
  const managed = new Set(layers);
  const before = ids.find(id => id.startsWith('smv-') || id.startsWith('poi-'));
  const expected = ids.filter(id => !managed.has(id));
  expected.splice(before ? expected.indexOf(before) : expected.length, 0, ...layers);
  if (expected.every((id, index) => id === ids[index])) return;
  ordering.add(map);
  try {
    for (const id of layers) map.moveLayer(id, before);
  } finally {
    ordering.delete(map);
  }
}
