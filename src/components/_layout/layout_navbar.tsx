import { useState } from 'react';
import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconClipboardText,
  IconInfoCircle,
  IconLogout,
  IconUser,
  type Icon,
} from '@tabler/icons-react';
import {
  Avatar,
  Box,
  Collapse,
  Group,
  Menu,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';


import { useGlobalStore } from '@/stores/global_stores';
import { basePath } from "@/lib/config";


const NAVY = '#0a1f6b'; // closed section header
const NAVY_DEEP = '#000e47'; // open header, same as AppShell header
const NAVY_TEXT = '#0a1f6b';
const ACCENT = '#00cc0a'; // active item marker f2b705
const PANEL_BG = '#eef1f9';

// TODO: replace with your real session / auth data (e.g. from your check-auth endpoint)
const USER = {
  name: 'Harriette Spoonlicker',
  email: 'hspoonlicker@outlook.com',
  image: '', // put an avatar URL here; falls back to the first letter of the name
};

type NavItem = {
  label: string;
  icon: Icon;
  children?: { label: string }[];
};

type NavSection = {
  label: string;
  items: NavItem[];
  link?: boolean; // true = plain button, no dropdown
};

// ---- Edit this config to change the menu -----------------------------------
const SECTIONS: NavSection[] = [
  { label: 'Dashboard', items: [], link: true },
  {
    label: 'Schedule of Market Value',
    items: [
      {
        label: 'ITEM 1',
        icon: IconInfoCircle,
        children: [
          { label: 'ITEM 1.1' }, 
          { label: 'ITEM 1.2' },
          { label: 'ITEM 1.3' },
          { label: 'ITEM 1.4' },
          { label: 'ITEM 1.5' },
          { label: 'ITEM 1.6' },
          { label: 'ITEM 1.7' },
          { label: 'ITEM 1.8' },
          { label: 'ITEM 1.9' },
          { label: 'ITEM 1.10' },
          { label: 'ITEM 1.11' },
          { label: 'ITEM 1.12' },
          { label: 'ITEM 1.13' },
          { label: 'ITEM 1.14' },
          { label: 'ITEM 1.141' },
          { label: 'ITEM 1.15' },
          { label: 'ITEM 1.16' },
          { label: 'ITEM 1.17' },
          { label: 'ITEM 1.18' },
        
        ],
      },
      { label: 'ITEM 2', icon: IconClipboardText },
    ],
  },
  { label: 'Point of Interest', items: [], link: true },
  {
    label: 'Demographic Data',
    items: [
      { label: 'Barangay Class', icon: IconClipboardText },
      { label: 'Number of Story of Building', icon: IconClipboardText },
      { label: 'Population', icon: IconClipboardText },
      { label: 'Type of Building', icon: IconClipboardText },
      { label: 'Year Built of Buildings', icon: IconClipboardText },
    ],
  },

  { label: 'User Management', items: [], link: true },
];
// -----------------------------------------------------------------------------

function NavRow({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: string;
  onSelect: (label: string) => void;
}) {
  const hasChildren = !!item.children?.length;
  const childActive = item.children?.some((c) => c.label === active);
  const [opened, setOpened] = useState(!!childActive);
  const isActive = !hasChildren && item.label === active;
  const ItemIcon = item.icon;

  const handleClick = () => {
    if (hasChildren) setOpened((o) => !o);
    else onSelect(item.label);
  };

  return (
    <>
      <UnstyledButton
        onClick={handleClick}
        aria-expanded={hasChildren ? opened : undefined}
        w="100%"
        px="sm"
        py={10}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          borderRadius: 6,
          color: NAVY_TEXT,
          background: isActive ? '#fff' : 'transparent',
          boxShadow: isActive
            ? `inset 3px 0 0 ${ACCENT}, 0 1px 3px rgba(0, 14, 71, 0.15)`
            : undefined,
          fontWeight: isActive ? 600 : 500,
        }}
      >
        <ItemIcon size={22} stroke={1.7} style={{ flexShrink: 0 }} />
        <Text size="sm" fw="inherit" c="inherit" style={{ flex: 1, lineHeight: 1.25 }}>
          {item.label}
        </Text>
        {hasChildren && (
          <IconChevronDown
            size={16}
            style={{
              transition: 'transform 150ms ease',
              transform: opened ? 'rotate(180deg)' : 'none',
            }}
          />
        )}
      </UnstyledButton>

      {hasChildren && (
        <Collapse expanded={opened}>
          <Stack gap={2} pl={48} pb={4}>
            {item.children!.map((child) => {
              const isChildActive = child.label === active;
              return (
                <UnstyledButton
                  key={child.label}
                  onClick={() => onSelect(child.label)}
                  px="sm"
                  py={6}
                  style={{
                    borderRadius: 6,
                    fontSize: 13,
                    color: NAVY_TEXT,
                    background: isChildActive ? '#fff' : 'transparent',
                    fontWeight: isChildActive ? 600 : 400,
                  }}
                >
                  {child.label}
                </UnstyledButton>
              );
            })}
          </Stack>
        </Collapse>
      )}
    </>
  );
}

function NavbarFooter({
  onProfile,
  onLogout,
}: {
  onProfile: () => void;
  onLogout: () => void;
}) {
  return (
    <Box
      p="xs"
      style={{
        borderTop: '1px solid #d9deee',
        background: '#fff',
        flexShrink: 0,
      }}
    >
      <Menu position="right-end" offset={8} width={200} withArrow shadow="md">
        <Menu.Target>
          <UnstyledButton w="100%" p="xs" style={{ borderRadius: 6 }}>
            <Group wrap="nowrap" gap="sm">
              <Avatar src={USER.image || null} radius="xl" size={40} color="blue">
                {USER.name[0]}
              </Avatar>

              <div style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" fw={600} c={NAVY_TEXT} truncate>
                  {USER.name}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {USER.email}
                </Text>
              </div>

              <IconChevronRight size={16} color={NAVY_TEXT} style={{ flexShrink: 0 }} />
            </Group>
          </UnstyledButton>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item leftSection={<IconUser size={16} />} onClick={onProfile}>
            Profile
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color="red"
            leftSection={<IconLogout size={16} />}
            onClick={onLogout}
          >
            Logout
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Box>
  );
}

export default function LayoutNavbar() {
  const [openSection, setOpenSection] = useState<string | null>(SECTIONS[0].label);
  const { clearAuth, setActivePage, activePage } = useGlobalStore();


  const handleLogout = async () => {
    await fetch(`${basePath}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    clearAuth(); // the page switches back to <Login />
  };

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ScrollArea type="auto" style={{ flex: 1, minHeight: 0 }}>
        <Stack gap={6} py="xs" pl="xs" pr={12}>
          {SECTIONS.map((section) => {
            const opened = openSection === section.label;
            const expandable = section.items.length > 0;

            if (section.link) {
              const isActive = activePage === section.label;
              return (
                <UnstyledButton
                  key={section.label}
                  onClick={() => setActivePage(section.label)}
                  w="100%"
                  px="md"
                  py={10}
                  style={{
                    background: isActive ? NAVY_DEEP : NAVY,
                    boxShadow: isActive ? `inset 3px 0 0 ${ACCENT}` : undefined,
                    borderRadius: 4,
                  }}
                >
                  <Text size="sm" fw={600} c="#fff" style={{ lineHeight: 1.25 }}>
                    {section.label}
                  </Text>
                </UnstyledButton>
              );
            }

            return (
              <Box key={section.label}>
                <UnstyledButton
                  onClick={() => setOpenSection(opened ? null : section.label)}
                  aria-expanded={opened}
                  w="100%"
                  px="md"
                  py={10}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    background: opened ? NAVY_DEEP : NAVY,
                    color: '#fff',
                    borderRadius: 4,
                  }}
                >
                  <Text size="sm" fw={600} c="#fff" style={{ lineHeight: 1.25 }}>
                    {section.label}
                  </Text>
                  {opened ? (
                    <IconChevronUp size={16} style={{ flexShrink: 0 }} />
                  ) : (
                    <IconChevronDown size={16} style={{ flexShrink: 0 }} />
                  )}
                </UnstyledButton>

                <Collapse expanded={opened}>
                  <Box p={6} style={{ background: PANEL_BG }}>
                    {expandable ? (
                      <Stack gap={2}>
                        {section.items.map((item) => (
                          <NavRow
                            key={item.label}
                            item={item}
                            active={activePage}
                            onSelect={setActivePage}
                          />
                        ))}
                      </Stack>
                    ) : (
                      <Text size="xs" c="dimmed" p="sm">
                        No items yet.
                      </Text>
                    )}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Stack>
      </ScrollArea>

      <NavbarFooter onProfile={() => setActivePage('Profile')} onLogout={handleLogout} />
    </Box>
  );
}
