import { useMemo, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Center,
  CloseButton,
  Group,
  Menu,
  MultiSelect,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconDotsVertical,
  IconMail,
  IconMapPin,
  IconPencil,
  IconPhone,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import {
  EMPTY_FILTERS,
  MUNICIPALITIES,
  PROVINCES,
  REGIONS,
  USERS,
  filterUsers,
  searchUsers,
  type Scope,
  type User,
  type UserFilters,
  type UserStatus,
} from './users.data';

// Your global CSS sets overflow-y: hidden, so this page scrolls inside its own container.
// Set this to the height of your top header (the "SMV Web Application" bar) so the container
// fills the rest of the screen. Adjust it if your layout adds extra padding around the page.
const HEADER_HEIGHT = 60;
const PAGE_SIZE_OPTIONS = ['3','6', '9', '12'];
const REGION_OPTIONS = REGIONS.map((r) => ({ value: r.code, label: r.name }));

const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const AVATAR_COLORS = ['blue', 'grape', 'indigo', 'teal', 'lime', 'orange', 'pink', 'cyan'];

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// Same user always gets the same color
const getAvatarColor = (userId: number) => AVATAR_COLORS[userId % AVATAR_COLORS.length];

// e.g. [{ level: 'municipality', count: 2 }]
const summarizeScopes = (scopes: Scope[]) => {
  const counts = new Map<string, number>();
  scopes.forEach((s) => counts.set(s.scope_level, (counts.get(s.scope_level) ?? 0) + 1));
  return Array.from(counts, ([level, count]) => ({ level, count }));
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function UserCard({ user }: { user: User }) {
  
  const scopeSummary = summarizeScopes(user.scopes);

  return (
    <Paper withBorder radius="md" p="md" shadow="xs" style={{ borderColor: '#0a1f6b' }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Group wrap="nowrap" gap="md" align="flex-start">
          <Avatar color={getAvatarColor(user.user_id)} size={52} radius="xl">
            {getInitials(user.full_name)}
          </Avatar>
          <div>
            <Text fw={500} size="sm" lh={1.3}>
              {user.full_name}
            </Text>
            <Text c="dimmed" size="xs">
              @{user.username}
            </Text>
            <Text fw={700} size="xs" mt={6}>
              {user.role}
            </Text>
          </div>
        </Group>

        <Group gap={4} wrap="nowrap">
          <Badge
            size="sm"
            variant="light"
            color={user.status === 'active' ? 'green' : 'gray'}
          >
            {user.status}
          </Badge>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${user.full_name}`}>
                <IconDotsVertical size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPencil size={14} />}>Edit user</Menu.Item>
              <Menu.Item leftSection={<IconMapPin size={14} />}>Manage scope</Menu.Item>
              <Menu.Item color="red" leftSection={<IconTrash size={14} />}>
                Delete user
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <Stack gap={6} mt="md">
        <Group gap="xs" wrap="nowrap">
          <IconMail size={14} stroke={1.5} />
          <Text size="xs" truncate>
            {user.email}
          </Text>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <IconPhone size={14} stroke={1.5} />
          <Text size="xs">{user.phone_number}</Text>
        </Group>
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <IconMapPin size={14} stroke={1.5} style={{ marginTop: 2 }} />
          <Text size="xs" c="dimmed">
            {user.address}
          </Text>
        </Group>
      </Stack>

      <Group gap={6} mt="md">
        {scopeSummary.length === 0 ? (
          <Text size="xs" c="dimmed">
            No scope assigned
          </Text>
        ) : (
          scopeSummary.map(({ level, count }) => (
            <Badge key={level} size="sm" variant="outline" color="blue">
              {capitalize(level)} × {count}
            </Badge>
          ))
        )}
      </Group>
    </Paper>
  );
}

import AddUser from './add_user';


export default function UserManagementMain() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('6');

  const [filters, setFilters] = useState<UserFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);

  //Add Users
  const [isOpenAddModal, setIsOpenAddModal] = useState(false);

  // Cascading options: provinces follow the selected regions,
  // municipalities follow the selected provinces (or regions when no province is picked).
  const provinceOptions = useMemo(
    () =>
      PROVINCES.filter((p) => filters.reg_code.length === 0 || filters.reg_code.includes(p.reg_code)).map(
        (p) => ({ value: p.code, label: p.name }),
      ),
    [filters.reg_code],
  );

  const municipalityOptions = useMemo(() => {
    const provinceRegion = new Map(PROVINCES.map((p) => [p.code, p.reg_code]));
    return MUNICIPALITIES.filter((m) => {
      if (filters.pro_code.length > 0) return filters.pro_code.includes(m.pro_code);
      if (filters.reg_code.length > 0) return filters.reg_code.includes(provinceRegion.get(m.pro_code) ?? '');
      return true;
    }).map((m) => ({ value: m.code, label: m.name }));
  }, [filters.reg_code, filters.pro_code]);

  const hasActiveFilters =
    filters.reg_code.length > 0 ||
    filters.pro_code.length > 0 ||
    filters.mun_code.length > 0 ||
    filters.status.length > 0 ||
    search.trim().length > 0;

  const handleRegionChange = (reg_code: string[]) => {
    // Drop selected provinces / municipalities that no longer belong to the chosen regions
    const validProvinces = PROVINCES.filter((p) => reg_code.length === 0 || reg_code.includes(p.reg_code));
    const pro_code = filters.pro_code.filter((c) => validProvinces.some((p) => p.code === c));
    const validProvinceCodes = new Set(validProvinces.map((p) => p.code));
    const mun_code = filters.mun_code.filter((c) =>
      MUNICIPALITIES.some((m) => m.code === c && validProvinceCodes.has(m.pro_code)),
    );
    setFilters({ ...filters, reg_code, pro_code, mun_code });
    setPage(1);
  };

  const handleProvinceChange = (pro_code: string[]) => {
    const mun_code =
      pro_code.length === 0
        ? filters.mun_code
        : filters.mun_code.filter((c) => MUNICIPALITIES.some((m) => m.code === c && pro_code.includes(m.pro_code)));
    setFilters({ ...filters, pro_code, mun_code });
    setPage(1);
  };

  const handleMunicipalityChange = (mun_code: string[]) => {
    setFilters({ ...filters, mun_code });
    setPage(1);
  };

  const handleStatusChange = (status: string[]) => {
    setFilters({ ...filters, status: status as UserStatus[] });
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearch('');
    setPage(1);
  };

  const size = Number(pageSize);

  const filteredUsers = useMemo(
    () => searchUsers(filterUsers(USERS, filters), debouncedSearch),
    [filters, debouncedSearch],
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / size));

  const visibleUsers = useMemo(() => {
    const start = (page - 1) * size;
    return filteredUsers.slice(start, start + size);
  }, [filteredUsers, page, size]);

  const from = filteredUsers.length === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, filteredUsers.length);

  const handlePageSizeChange = (value: string | null) => {
    if (!value) return;
    setPageSize(value);
    setPage(1);
  };

  return (
    <Box
      h={`calc(100dvh - ${HEADER_HEIGHT}px)`}
      style={{ overflowY: 'auto', overflowX: 'hidden' }}
    >
    <Stack gap="xs" p="xs">
      <Group justify="space-between">
        <Title order={3} fw={500} size="h4" c="#0a1f6b">
          User Management
        </Title>
        <Button variant="outline" size="xs" rightSection={<IconPlus size={16} />} aria-label="Add user" onClick={() => setIsOpenAddModal(true)} style={{ borderColor:'#0a1f6b', color:'#0a1f6b' }}>
          ADD USER
        </Button>
      </Group>

      <TextInput
        placeholder="Search name, email, phone, role, location..."
        aria-label="Search users"
        leftSection={<IconSearch size={16} />}
        rightSection={
          search ? (
            <CloseButton size="sm" aria-label="Clear search" onClick={() => handleSearchChange('')} />
          ) : null
        }
        value={search}
        onChange={(event) => handleSearchChange(event.currentTarget.value)}
        size="sm"
        styles={{
          input: {
            borderColor:'#0a1f6b'
          }
        }}

      />

      <Stack gap="xs">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          <MultiSelect
            label="Region"
            placeholder="All regions"
            data={REGION_OPTIONS}
            value={filters.reg_code}
            onChange={handleRegionChange}
            size="sm"
            searchable
            clearable
            styles={{
              input: {
                borderColor:'#0a1f6b'
              }
            }}
          />
          <MultiSelect
            label="Province"
            placeholder="All provinces"
            data={provinceOptions}
            value={filters.pro_code}
            onChange={handleProvinceChange}
            size="sm"
            searchable
            clearable
            styles={{
              input: {
                borderColor:'#0a1f6b'
              }
            }}
          />
          <MultiSelect
            label="Municipality"
            placeholder="All municipalities"
            data={municipalityOptions}
            value={filters.mun_code}
            onChange={handleMunicipalityChange}
            searchable
            clearable
            size="sm"
            styles={{
              input: {
                borderColor:'#0a1f6b'
              }
            }}
          />
          <MultiSelect
            label="Status"
            placeholder="Active and inactive"
            data={STATUS_OPTIONS}
            value={filters.status}
            onChange={handleStatusChange}
            clearable
            size="sm"
            styles={{
              input: {
                borderColor:'#0a1f6b'
              }
            }}
          />
        </SimpleGrid>
        {hasActiveFilters && (
          <Group justify="flex-end">
            <Button variant="subtle" size="xs" onClick={resetFilters}>
              Reset filters
            </Button>
          </Group>
        )}
      </Stack>

      {visibleUsers.length === 0 ? (
        <Center py="xl">
          <Text c="dimmed">No users match your search or filters.</Text>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {visibleUsers.map((user) => (
            <UserCard key={user.user_id} user={user} />
          ))}
        </SimpleGrid>
      )}

      <Group justify="space-between" mt="sm">
        <Group gap="xs">
          <Text size="sm" c="#0a1f6b">
            Showing {from}–{to} of {filteredUsers.length}
          </Text>
          <Select
            data={PAGE_SIZE_OPTIONS}
            value={pageSize}
            onChange={handlePageSizeChange}
            allowDeselect={false}
            w={72}
            size="xs"
            aria-label="Users per page"
            styles={{
              input: {
                borderColor:'#0a1f6b'
              }
            }}
          />
        </Group>

        <Pagination total={totalPages} value={page} onChange={setPage} withEdges radius="md" color="#0a1f6b" />
      </Group>
    </Stack>
    
    <AddUser 
      setIsOpenAddModal={setIsOpenAddModal}
      isOpenAddModal={isOpenAddModal}
    />


    </Box>
  );
}
