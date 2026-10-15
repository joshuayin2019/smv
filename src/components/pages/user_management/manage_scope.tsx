import { useEffect, useState } from "react";
import { Alert, Button, Center, Group, Loader, Modal } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { user_management_url } from "@/lib/config";
import ScopeEditor, { MODULES, scopeKey, type ScopeItem } from "./scope_editor";
import type { User } from "./users.utils";

interface Props {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}

const toItem = (r: any): ScopeItem => {
  const lvl = Number(r.scope_level);
  return {
    key: scopeKey(lvl, r.reg_code, r.pro_code, r.mun_code),
    scope_level: lvl,
    reg_code: r.reg_code ?? null,
    pro_code: r.pro_code ?? null,
    mun_code: r.mun_code ?? null,
    region: lvl === 1 ? "All areas" : r.reg_name ?? r.reg_code ?? "-",
    province: lvl >= 3 ? r.pro_name ?? r.pro_code ?? "-" : "-",
    city: lvl >= 4 ? r.mun_name ?? r.mun_code ?? "-" : "-",
    modules: MODULES.filter((m) => r[m.toLowerCase()]),
  };
};

export default function ManageScope({ user, onClose, onSaved }: Props) {
  const [items, setItems] = useState<ScopeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${user_management_url}/${user.id}/scope`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) throw new Error(data.error ?? "Failed to load scope");
        setItems(data.map(toItem));
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError(e?.message ?? "Failed to load scope");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [user.id]);

  const handleSave = async () => {
    if (items.length === 0) {
      setError("Add at least one scope");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${user_management_url}/${user.id}/scope`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopes: items.map((s) => ({
            scope_level: s.scope_level,
            reg_code: s.reg_code,
            pro_code: s.pro_code,
            mun_code: s.mun_code,
            poi: s.modules.includes("POI"),
            smv: s.modules.includes("SMV"),
            psa: s.modules.includes("PSA"),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save scope");
        return;
      }
      notifications.show({
        title: "Scope updated",
        message: `Scope for ${user.full_name} was saved.`,
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
    <Modal opened onClose={onClose} title={`Manage scope — ${user.full_name}`} size="xl" centered>
      {error && (
        <Alert
          color="red" variant="light" icon={<IconAlertCircle size={18} />}
          title={error} withCloseButton onClose={() => setError(null)}
        />
      )}

      {loading ? (
        <Center py="xl"><Loader size="sm" /></Center>
      ) : (
        <ScopeEditor
          value={items}
          onChange={(next) => {
            setItems(next);
            setError(null);
          }}
        />
      )}

      <Group justify="flex-end" mt="xl">
        <Button variant="default" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={handleSave} loading={saving} disabled={loading}>Save</Button>
      </Group>
    </Modal>
  );
}