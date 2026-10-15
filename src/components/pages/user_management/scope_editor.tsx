import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon, Badge, Button, Fieldset, Group, MultiSelect,
  Select, SimpleGrid, Table, Text,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { user_management_url } from "@/lib/config";

export const MODULES = ["SMV", "POI", "PSA"];

const SCOPE_LEVELS = [
  { value: "2", label: "Region" },
  { value: "3", label: "Province" },
  { value: "4", label: "Municipality" },
];

interface LocationRow {
  reg_code: string; reg_name: string;
  pro_code: string; pro_name: string;
  mun_code: string; mun_name: string;
}

export interface ScopeItem {
  key: string;
  scope_level: number; // 1 = all, 2 = region, 3 = province, 4 = municipality
  reg_code: string | null;
  pro_code: string | null;
  mun_code: string | null;
  region: string;
  province: string;
  city: string;
  modules: string[];
}

// identifies a scope by its level + the code that level is about
export const scopeKey = (
  lvl: number, reg?: string | null, pro?: string | null, mun?: string | null
) => `${lvl}|${lvl === 2 ? reg : lvl === 3 ? pro : lvl === 4 ? mun : ""}`;

let locationsCache: LocationRow[] | null = null;

function useLocations() {
  const [locations, setLocations] = useState<LocationRow[]>(locationsCache ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (locationsCache) return;
    fetch(`${user_management_url}/locations`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          locationsCache = data;
          setLocations(data);
        }
      })
      .catch(() => setError("Failed to load locations"));
  }, []);

  return { locations, error };
}

interface Props {
  value: ScopeItem[];
  onChange: (items: ScopeItem[]) => void;
}

export default function ScopeEditor({ value, onChange }: Props) {
  const { locations, error } = useLocations();

  const [modules, setModules] = useState<string[]>([]);
  const [level, setLevel] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);

  const lvl = Number(level ?? 0);
  const needsRegion = lvl >= 2;
  const needsProvince = lvl >= 3;
  const needsCity = lvl >= 4;

  const regionOptions = useMemo(() => {
    const map = new Map<string, string>();
    locations.forEach((l) => l.reg_code && map.set(l.reg_code, l.reg_name));
    return [...map].map(([value, label]) => ({ value, label }));
  }, [locations]);

  const provinceOptions = useMemo(() => {
    const map = new Map<string, string>();
    locations
      .filter((l) => l.reg_code === region && l.pro_code)
      .forEach((l) => map.set(l.pro_code, l.pro_name));
    return [...map].map(([value, label]) => ({ value, label }));
  }, [locations, region]);

  const cityOptions = useMemo(() => {
    const map = new Map<string, string>();
    locations
      .filter((l) => l.pro_code === province && l.mun_code)
      .forEach((l) => map.set(l.mun_code, l.mun_name));
    return [...map].map(([value, label]) => ({ value, label }));
  }, [locations, province]);

  const labelOf = (opts: { value: string; label: string }[], v: string | null) =>
    opts.find((o) => o.value === v)?.label ?? "";

  const canAdd =
    modules.length > 0 &&
    lvl > 0 &&
    (!needsRegion || !!region) &&
    (!needsProvince || !!province) &&
    (!needsCity || !!city);

  const handleAdd = () => {
    if (!canAdd) return;
    const reg = needsRegion ? region : null;
    const pro = needsProvince ? province : null;
    const mun = needsCity ? city : null;
    const key = scopeKey(lvl, reg, pro, mun);

    const item: ScopeItem = {
      key,
      scope_level: lvl,
      reg_code: reg,
      pro_code: pro,
      mun_code: mun,
      region: lvl === 1 ? "All areas" : labelOf(regionOptions, region),
      province: needsProvince ? labelOf(provinceOptions, province) : "-",
      city: needsCity ? labelOf(cityOptions, city) : "-",
      modules,
    };

    // adding the same area again just updates its modules
    const exists = value.some((r) => r.key === key);
    onChange(exists ? value.map((r) => (r.key === key ? item : r)) : [...value, item]);
    setProvince(null);
    setCity(null);
  };

  return (
    <>
      <Fieldset legend="Add scope" mt="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <MultiSelect
            label="Access modules"
            withAsterisk
            placeholder="Select modules"
            data={MODULES}
            value={modules}
            onChange={setModules}
            clearable
          />
          <Select
            label="Scope level"
            withAsterisk
            placeholder="Select scope level"
            data={SCOPE_LEVELS}
            value={level}
            allowDeselect={false}
            onChange={(v) => {
              setLevel(v);
              setProvince(null);
              setCity(null);
            }}
          />
          {needsRegion && (
            <Select
              label="Region name"
              withAsterisk
              searchable
              placeholder="Select region"
              data={regionOptions}
              value={region}
              onChange={(v) => {
                setRegion(v);
                setProvince(null);
                setCity(null);
              }}
            />
          )}
          {needsProvince && (
            <Select
              label="Province"
              withAsterisk
              searchable
              placeholder="Select province"
              data={provinceOptions}
              value={province}
              disabled={!region}
              onChange={(v) => {
                setProvince(v);
                setCity(null);
              }}
            />
          )}
          {needsCity && (
            <Select
              label="City / Municipality"
              withAsterisk
              searchable
              placeholder="Select city"
              data={cityOptions}
              value={city}
              disabled={!province}
              onChange={setCity}
            />
          )}
        </SimpleGrid>

        {error && <Text c="red" size="sm" mt="sm">{error}</Text>}

        <Group justify="flex-end" mt="md">
          <Button onClick={handleAdd} disabled={!canAdd}>Add to table</Button>
        </Group>
      </Fieldset>

      <Table withTableBorder withColumnBorders mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Region</Table.Th>
            <Table.Th>Province</Table.Th>
            <Table.Th>City</Table.Th>
            <Table.Th>Modules</Table.Th>
            <Table.Th w={90}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {value.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text size="sm" c="dimmed" ta="center">No scope added yet</Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            value.map((row) => (
              <Table.Tr key={row.key}>
                <Table.Td>{row.region}</Table.Td>
                <Table.Td>{row.province}</Table.Td>
                <Table.Td>{row.city}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {row.modules.map((m) => (
                      <Badge key={m} size="xs" variant="outline">{m}</Badge>
                    ))}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    aria-label="Remove scope"
                    onClick={() => onChange(value.filter((r) => r.key !== row.key))}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </>
  );
}