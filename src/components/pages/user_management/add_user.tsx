import { useEffect, useMemo, useState } from "react";
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
  TextInput, Alert
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle, IconTrash } from "@tabler/icons-react";
import { user_management_url } from "@/lib/config"; // adjust to your config export
import { notifications } from "@mantine/notifications";

import { MODULES } from './scope_editor';

const SCOPE_LEVELS = [
  { value: "region", label: "Region" },
  { value: "province", label: "Province" },
  { value: "municipality", label: "Municipality" },
];

interface LocationRow {
  reg_code: string;
  reg_name: string;
  pro_code: string;
  pro_name: string;
  mun_code: string;
  mun_name: string;
}

interface ScopeRow {
  key: string;
  scope_level: string;
  reg_code: string;
  pro_code: string | null;
  mun_code: string | null;
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
  onSaved?: () => void; // e.g. refresh the users table
}

const STEP1_FIELDS: (keyof UserFormValues)[] = [
  "full_name", "phone_number", "address", "username", "email", "status", "password",
];

export default function AddUser({ isOpenAddModal, setIsOpenAddModal, onSaved }: Props) {
  const [active, setActive] = useState(0);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [modules, setModules] = useState<string[]>([]);
  const [scopeLevel, setScopeLevel] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [scopeRows, setScopeRows] = useState<ScopeRow[]>([]);


  // keeps digits only, max 9; also handles pasted "+639…" / "09…" numbers
  const cleanPhone = (raw: string) => {
    let d = raw.replace(/\D/g, "");
    if (d.length > 9) {
      if (d.startsWith("639")) d = d.slice(3);
      else if (d.startsWith("09")) d = d.slice(2);
    }
    return d.slice(0, 9);
  };

  const form = useForm<UserFormValues>({
    initialValues: {
      full_name: "", phone_number: "", address: "",
      username: "", email: "", status: "active", password: "",
    },
    onValuesChange: () => setSubmitError(null),
    validate: {
      full_name: (v) => (v.trim() ? null : "Full name is required"),
      phone_number: (v) => (/^\d{9}$/.test(v) ? null : "Enter the remaining 9 digits"),
      address: (v) => (v.trim() ? null : "Address is required"),
      username: (v) => (v.trim() ? null : "Username is required"),
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email"),
      status: (v) => (v ? null : "Status is required"),
      password: (v) => (v.length > 4 ? null : "Password must be longer than 4 characters"),
    },
  });

  /* load core.muni_bndry once when the modal opens */
  useEffect(() => {
    if (!isOpenAddModal || locations.length) return;
    fetch(`${user_management_url}/locations`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setLocations(data))
      .catch(() => setSubmitError("Failed to load locations"));
  }, [isOpenAddModal, locations.length]);

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

  const needsProvince = scopeLevel === "province" || scopeLevel === "municipality";
  const needsCity = scopeLevel === "municipality";

  const labelOf = (opts: { value: string; label: string }[], v: string | null) =>
    opts.find((o) => o.value === v)?.label ?? "";

  const canAddToTable =
    !!scopeLevel && !!region && (!needsProvince || !!province) && (!needsCity || !!city);

  const handleAddToTable = () => {
    if (!canAddToTable || !scopeLevel || !region) return;
    const key = [scopeLevel, region, needsProvince ? province : "", needsCity ? city : ""].join("|");
    if (scopeRows.some((r) => r.key === key)) return;

    setScopeRows((rows) => [
      ...rows,
      {
        key,
        scope_level: scopeLevel,
        reg_code: region,
        pro_code: needsProvince ? province : null,
        mun_code: needsCity ? city : null,
        region: labelOf(regionOptions, region),
        province: needsProvince ? labelOf(provinceOptions, province) : "-",
        city: needsCity ? labelOf(cityOptions, city) : "-",
      },
    ]);
    setProvince(null);
    setCity(null);
  };

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
    setSubmitError(null);
  };

  const handleClose = () => {
    resetAll();
    setIsOpenAddModal(false);
  };

  const handleSubmit = async () => {
    if (form.validate().hasErrors) {
      setActive(0);
      return;
    }
    if (scopeRows.length === 0) {
      setSubmitError("Add at least one scope to the table");
      return;
    }

    setSaving(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${user_management_url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: { ...form.values, phone_number: `+639${form.values.phone_number}` },
          modules,
          scopes: scopeRows.map(({ scope_level, reg_code, pro_code, mun_code }) => ({
            scope_level, reg_code, pro_code, mun_code,
          })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to save user");
        if (res.status === 409) setActive(0); // duplicate username/email: go back to fix it
        return;
      }

      notifications.show({
        title: "User added",
        message: `${form.values.full_name} was added${data.user_id ? ` (${data.user_id})` : ""}.`,
        color: "green",
      });

      onSaved?.();
      handleClose();
    } catch {
      setSubmitError("Network error, please try again");
    } finally {
      setSaving(false);
    }
  };

  const errorAlert = submitError && (
    <Alert
      mt="md"
      color="red"
      variant="light"
      icon={<IconAlertCircle size={18} />}
      title={submitError}
      withCloseButton
      onClose={() => setSubmitError(null)}
    />
  );

  return (
    <Modal opened={isOpenAddModal} onClose={handleClose} title="Add User" size="xl" centered>

      <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false}>
        
        <Stepper.Step label="User Information" description="Personal and account details">
          {errorAlert}
          <Fieldset legend="Personal information" mt="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="Full Name" withAsterisk {...form.getInputProps("full_name")} />
              <TextInput
                label="Phone Number"
                placeholder="123456789"
                withAsterisk
                inputMode="numeric"
                maxLength={13}
                leftSection={<Text size="sm" fw={500}>+639</Text>}
                leftSectionWidth={54}
                leftSectionPointerEvents="none"
                {...form.getInputProps("phone_number")}
                onChange={(e) => form.setFieldValue("phone_number", cleanPhone(e.currentTarget.value))}
              />
            </SimpleGrid>
            <TextInput mt="md" label="Address" withAsterisk {...form.getInputProps("address")} />
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

        <Stepper.Step label="Scope Table" description="Access and coverage">
          {errorAlert}
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
                searchable
                placeholder="Select region"
                data={regionOptions}
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
                <Table.Th>Province</Table.Th>
                <Table.Th>City</Table.Th>
                <Table.Th w={90}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {scopeRows.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text size="sm" c="dimmed" ta="center">No scope added yet</Text>
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



      <Group justify="space-between" mt="xl">
        <Button variant="default" onClick={prevStep} disabled={active === 0 || saving}>
          Back
        </Button>
        {active === 0 ? (
          <Button onClick={nextStep}>Next</Button>
        ) : (
          <Button onClick={handleSubmit} loading={saving}>Add</Button>
        )}
      </Group>
    </Modal>
  );
}
