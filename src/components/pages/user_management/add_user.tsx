

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Button,
  Fieldset,
  Group,
  Modal,
  MultiSelect,
  PasswordInput,
  Select,
  SimpleGrid,
  Stepper,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconTrash } from "@tabler/icons-react";

/* ---------- static sample data (replace with your API / DB later) ---------- */

const MODULES = ["SMV", "Zonal Value", "POI", "PSA", "Farm Activity"];

const SCOPE_LEVELS = [
  { value: "region", label: "Region" },
  { value: "province", label: "Province" },
  { value: "municipality", label: "Municipality" },
];

const REGIONS = [
  { value: "NCR", label: "NCR" },
  { value: "R3", label: "Region III" },
];

const PROVINCES: Record<string, { value: string; label: string }[]> = {
  NCR: [{ value: "NCR-1", label: "Metro Manila" }],
  R3: [
    { value: "R3-BUL", label: "Bulacan" },
    { value: "R3-PAM", label: "Pampanga" },
  ],
};

const CITIES: Record<string, { value: string; label: string }[]> = {
  "NCR-1": [
    { value: "MNL", label: "Manila" },
    { value: "PSG", label: "Pasig" },
    { value: "QZN", label: "Quezon City" },
  ],
  "R3-BUL": [{ value: "MAL", label: "Malolos" }],
  "R3-PAM": [{ value: "ANG", label: "Angeles" }],
};

/* ---------- types ---------- */

interface ScopeRow {
  key: string;
  region: string;
  province: string;
  city: string;
}

interface UserFormValues {
  full_name: string;
  phone_number: string;
  address: string;
  username: string;
  email: string;
  status: string;
  password: string;
}

interface Props {
  isOpenAddModal: boolean;
  setIsOpenAddModal: (open: boolean) => void;
 // onSubmit?: (user: UserFormValues, scopes: ScopeRow[], modules: string[]) => void; // optional
}

const STEP1_FIELDS: (keyof UserFormValues)[] = [
  "full_name",
  "phone_number",
  "address",
  "username",
  "email",
  "status",
  "password",
];

/* ---------- component ---------- */

export default function AddUser({ isOpenAddModal, setIsOpenAddModal }: Props) {
  const [active, setActive] = useState(0);

  // scope step state
  const [modules, setModules] = useState<string[]>([]);
  const [scopeLevel, setScopeLevel] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [scopeRows, setScopeRows] = useState<ScopeRow[]>([]);

  const form = useForm<UserFormValues>({
    initialValues: {
      full_name: "",
      phone_number: "",
      address: "",
      username: "",
      email: "",
      status: "active",
      password: "",
    },
    validate: {
      full_name: (v) => (v.trim() ? null : "Full name is required"),
      phone_number: (v) => (v.trim() ? null : "Phone number is required"),
      address: (v) => (v.trim() ? null : "Address is required"),
      username: (v) => (v.trim() ? null : "Username is required"),
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email"),
      status: (v) => (v ? null : "Status is required"),
      password: (v) => (v.length >= 8 ? null : "Use at least 8 characters"),
    },
  });

  /* which dropdowns are needed depends on the scope level */
  const needsProvince = scopeLevel === "province" || scopeLevel === "municipality";
  const needsCity = scopeLevel === "municipality";

  const provinceOptions = useMemo(() => (region ? PROVINCES[region] ?? [] : []), [region]);
  const cityOptions = useMemo(() => (province ? CITIES[province] ?? [] : []), [province]);

  const labelOf = (opts: { value: string; label: string }[], v: string | null) =>
    opts.find((o) => o.value === v)?.label ?? "";

  const canAddToTable =
    !!scopeLevel && !!region && (!needsProvince || !!province) && (!needsCity || !!city);

  const handleAddToTable = () => {
    if (!canAddToTable) return;
    const key = [region, province, city].filter(Boolean).join("|");
    if (scopeRows.some((r) => r.key === key)) return; // no duplicates

    setScopeRows((rows) => [
      ...rows,
      {
        key,
        region: labelOf(REGIONS, region),
        province: needsProvince ? labelOf(provinceOptions, province) : "-",
        city: needsCity ? labelOf(cityOptions, city) : "-",
      },
    ]);
    setProvince(null);
    setCity(null);
  };

  /* stepper navigation */
  const nextStep = () => {
    if (active === 0) {
      let hasErrors = false;
      STEP1_FIELDS.forEach((f) => {
        if (form.validateField(f).hasError) hasErrors = true;
      });
      if (hasErrors) return;
    }
    setActive((s) => Math.min(s + 1, 1));
  };

  const prevStep = () => setActive((s) => Math.max(s - 1, 0));

  const resetAll = () => {
    form.reset();
    setActive(0);
    setModules([]);
    setScopeLevel(null);
    setRegion(null);
    setProvince(null);
    setCity(null);
    setScopeRows([]);
  };

  const handleClose = () => {
    resetAll();
    setIsOpenAddModal(false);
  };

  const handleSubmit = () => {
    if (form.validate().hasErrors) {
      setActive(0);
      return;
    }
    //onSubmit?.(form.values, scopeRows, modules);
    handleClose();
  };

  return (
    <Modal opened={isOpenAddModal} onClose={handleClose} title="Add User" size="xl" centered>
      <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false}>
        {/* ---------------- Step 1 ---------------- */}
        <Stepper.Step label="User Information" description="Personal and account details">
          <Fieldset legend="Personal information" mt="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="Full Name" withAsterisk {...form.getInputProps("full_name")} />
              <TextInput
                label="Phone Number"
                withAsterisk
                {...form.getInputProps("phone_number")}
              />
            </SimpleGrid>
            <TextInput
              mt="md"
              label="Address"
              withAsterisk
              {...form.getInputProps("address")}
            />
          </Fieldset>

          <Fieldset legend="Account details" mt="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="Username" withAsterisk {...form.getInputProps("username")} />
              <TextInput label="Email" withAsterisk {...form.getInputProps("email")} />
              <Select
                label="Status"
                withAsterisk
                allowDeselect={false}
                data={[
                  { value: "active", label: "active" },
                  { value: "inactive", label: "inactive" },
                ]}
                {...form.getInputProps("status")}
              />
              <PasswordInput label="Password" withAsterisk {...form.getInputProps("password")} />
            </SimpleGrid>
          </Fieldset>
        </Stepper.Step>

        {/* ---------------- Step 2 ---------------- */}
        <Stepper.Step label="Scope Table" description="Access and coverage">
          <Fieldset legend="Access form" mt="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <MultiSelect
                label="Access modules"
                placeholder="Select modules"
                data={MODULES}
                value={modules}
                onChange={setModules}
                clearable
              />
              <Select
                label="Scope level"
                placeholder="Select scope level"
                data={SCOPE_LEVELS}
                value={scopeLevel}
                onChange={(v) => {
                  setScopeLevel(v);
                  setProvince(null);
                  setCity(null);
                }}
              />
              <Select
                label="Region name"
                withAsterisk
                placeholder="Select region"
                data={REGIONS}
                value={region}
                disabled={!scopeLevel}
                onChange={(v) => {
                  setRegion(v);
                  setProvince(null);
                  setCity(null);
                }}
              />
              {needsProvince && (
                <Select
                  label="Province"
                  withAsterisk
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
                  placeholder="Select city"
                  data={cityOptions}
                  value={city}
                  disabled={!province}
                  onChange={setCity}
                />
              )}
            </SimpleGrid>

            <Group justify="flex-end" mt="md">
              <Button onClick={handleAddToTable} disabled={!canAddToTable}>
                Add to table
              </Button>
            </Group>
          </Fieldset>

          <Table withTableBorder withColumnBorders mt="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Region</Table.Th>
                <Table.Th>Provincial</Table.Th>
                <Table.Th>City</Table.Th>
                <Table.Th w={90}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {scopeRows.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text size="sm" c="dimmed" ta="center">
                      No scope added yet
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                scopeRows.map((row) => (
                  <Table.Tr key={row.key}>
                    <Table.Td>{row.region}</Table.Td>
                    <Table.Td>{row.province}</Table.Td>
                    <Table.Td>{row.city}</Table.Td>
                    <Table.Td>
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        aria-label="Remove scope"
                        onClick={() => setScopeRows((rows) => rows.filter((r) => r.key !== row.key))}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Stepper.Step>
      </Stepper>

      {/* ---------------- Footer buttons ---------------- */}
      <Group justify="space-between" mt="xl">
        <Button variant="default" onClick={prevStep} disabled={active === 0}>
          Back
        </Button>
        {active === 0 ? (
          <Button onClick={nextStep}>Next</Button>
        ) : (
          <Button onClick={handleSubmit}>Add</Button>
        )}
      </Group>
    </Modal>
  );
}

/* ---------- usage ----------
import { useDisclosure } from "@mantine/hooks";

const [opened, { open, close }] = useDisclosure(false);

<Button onClick={open}>Add User</Button>
<AddUserStepperModal
  opened={opened}
  onClose={close}
  onSubmit={(user, scopes, modules) => console.log(user, scopes, modules)}
/>
*/
