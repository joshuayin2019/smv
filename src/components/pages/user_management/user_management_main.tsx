import { useMemo, useState, useEffect } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  CloseButton,
  Group,
  Loader,
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
  SCOPE_TYPES,
  filterUsers,
  normalizeUser,
  searchUsers,
  type ApiUser,
  type Scope,
  type User,
  type UserFilters,
  type UserStatus,
} from './users.utils';
import { basePath } from '@/lib/config';
import { useGlobalStore } from '@/stores/global_stores';
import AddUser from './add_user';

// Your global CSS sets overflow-y: hidden, so this page scrolls inside its own container.
// Set this to the height of your top header (the "SMV Web Application" bar) so the container
// fills the rest of the screen. Adjust it if your layout adds extra padding around the page.
const HEADER_HEIGHT = 60;
const PAGE_SIZE_OPTIONS = ['3', '6', '9', '12'];

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
const getAvatarColor = (id: number) => AVATAR_COLORS[id % AVATAR_COLORS.length];

// e.g. [{ type: 'poi', count: 2 }, { type: 'psa', count: 1 }]
const summarizeScopes = (scopes: Scope[]) =>
  SCOPE_TYPES.map((type) => ({ type, count: scopes.filter((s) => s.type === type).length })).filter(
    (x) => x.count > 0,
  );

function UserCard({ user }: { user: User }) {
  const scopeSummary = summarizeScopes(user.scopes);

  return (
    <Paper withBorder radius="md" p="md" shadow="xs" style={{ borderColor: '#0a1f6b' }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Group wrap="nowrap" gap="md" align="flex-start">
          <Avatar color={getAvatarColor(user.id)} size={52} radius="xl">
            {getInitials(user.full_name)}
          </Avatar>
          <div>
            <Text fw={500} size="sm" lh={1.3}>
              {user.full_name}
            </Text>
            <Text c="dimmed" size="xs">
              username: {user.username}
            </Text>
            {user.role && (
              <Text fw={700} size="xs" mt={6}>
                {user.role}
              </Text>
            )}
          </div>
        </Group>

        <Group gap={4} wrap="nowrap">
          {/* <Badge size="sm" variant="light" color={user.status === 'active' ? 'green' : 'gray'}>
            {user.status}
          </Badge> */}
          <Badge
            size="sm"
            variant="light"
            color={user.status === 'active' ? 'green' : 'gray'}
            style={{ flexShrink: 0 }}
            styles={{ label: { overflow: 'visible', textOverflow: 'clip' } }}
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
          <Text size="xs">+{user.phone_number}</Text>
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
          scopeSummary.map(({ type, count }) => (
            <Badge key={type} size="sm" variant="outline" color="blue">
              {type.toUpperCase()} × {count}
            </Badge>
          ))
        )}
      </Group>
    </Paper>
  );
}

export default function UserManagementMain() {
  const { auth } = useGlobalStore();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState('6');

  // Data from the API
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<UserFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);

  // Add Users
  const [isOpenAddModal, setIsOpenAddModal] = useState(false);

  // ---------- Load data ----------
  useEffect(() => {
    if (!auth) return;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${basePath}/api/pages/users_management`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const json = await response.json();
        const rows: ApiUser[] = Array.isArray(json) ? json : json.data;
        setUsers(rows.map(normalizeUser));
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.warn('Failed to load users:', e);
          setError(e?.message ?? 'Failed to load users');
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [auth]);

  const hasActiveFilters = filters.status.length > 0 || search.trim().length > 0;

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
    () => searchUsers(filterUsers(users, filters), debouncedSearch),
    [users, filters, debouncedSearch],
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

  const selectStyles = { input: { borderColor: '#0a1f6b' } };

  return (
    <Box h={`calc(100dvh - ${HEADER_HEIGHT}px)`} style={{ overflowY: 'auto', overflowX: 'hidden' }}>
      <Stack gap="xs" p="xs">
        <Group justify="space-between">
          <Title order={3} fw={500} size="h4" c="#0a1f6b">
            User Management
          </Title>
          <Button
            variant="outline"
            size="xs"
            rightSection={<IconPlus size={16} />}
            aria-label="Add user"
            onClick={() => setIsOpenAddModal(true)}
            style={{ borderColor: '#0a1f6b', color: '#0a1f6b' }}
          >
            ADD USER
          </Button>
        </Group>

        <TextInput
          placeholder="Search name, email, phone, role, address..."
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
          styles={selectStyles}
        />

        <Group align="flex-end" justify="space-between">
          <MultiSelect
            label="Status"
            placeholder="Active and inactive"
            data={STATUS_OPTIONS}
            value={filters.status}
            onChange={handleStatusChange}
            clearable
            size="sm"
            w={{ base: '100%', sm: 280 }}
            styles={selectStyles}
          />
          {hasActiveFilters && (
            <Button variant="subtle" size="xs" onClick={resetFilters}>
              Reset filters
            </Button>
          )}
        </Group>

        {error ? (
          <Center py="xl">
            <Text c="red">{error}</Text>
          </Center>
        ) : loading ? (
          <Center py="xl">
            <Loader size="sm" />
          </Center>
        ) : visibleUsers.length === 0 ? (
          <Center py="xl">
            <Text c="dimmed">No users match your search or filters.</Text>
          </Center>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl:4 }} spacing="md">
            {visibleUsers.map((user) => (
              <UserCard key={user.id} user={user} />
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
              styles={selectStyles}
            />
          </Group>

          <Pagination total={totalPages} value={page} onChange={setPage} withEdges radius="md" color="#0a1f6b" />
        </Group>
      </Stack>

      <AddUser setIsOpenAddModal={setIsOpenAddModal} isOpenAddModal={isOpenAddModal} />
    </Box>
  );
}
