import { useState } from "react";
import {
  Alert, Button, Fieldset, Group, Modal, PasswordInput,
  Select, SimpleGrid, Text, TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { IconAlertCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { user_management_url } from "@/lib/config";
import { cleanPhone, toLocalDigits } from "./form_utils";
import type { User } from "./users.utils";

interface Props {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditUser({ user, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      full_name: user.full_name ?? "",
      phone_number: toLocalDigits(user.phone_number),
      address: user.address ?? "",
      username: user.username ?? "",
      email: user.email ?? "",
      status: String(user.status ?? "active"),
      password: "", // blank = keep current password
    },
    onValuesChange: () => setError(null),
    validate: {
      full_name: (v) => (v.trim() ? null : "Full name is required"),
      phone_number: (v) => (/^\d{9}$/.test(v) ? null : "Enter the remaining 9 digits"),
      address: (v) => (v.trim() ? null : "Address is required"),
      username: (v) => (v.trim() ? null : "Username is required"),
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email"),
      password: (v) => (v === "" || v.length > 4 ? null : "Password must be longer than 4 characters"),
    },
  });

  const handleSave = async () => {
    if (form.validate().hasErrors) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${user_management_url}/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form.values,
          phone_number: `+639${form.values.phone_number}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update user");
        if (data.field === "username" || data.field === "email") {
          form.setFieldError(data.field, data.error);
        }
        return;
      }
      notifications.show({
        title: "User updated",
        message: `${form.values.full_name} was updated.`,
        color: "green",
      });
      onSaved();
      onClose();
    } catch {
      setError("Network error, please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={`Edit user — ${user.username}`} size="lg" centered>
      {error && (
        <Alert
          color="red" variant="light" icon={<IconAlertCircle size={18} />}
          title={error} withCloseButton onClose={() => setError(null)}
        />
      )}

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
          <PasswordInput
            label="New password"
            description="Leave blank to keep the current password"
            {...form.getInputProps("password")}
          />
        </SimpleGrid>
      </Fieldset>

      <Group justify="flex-end" mt="xl">
        <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>Save</Button>
      </Group>
    </Modal>
  );
}