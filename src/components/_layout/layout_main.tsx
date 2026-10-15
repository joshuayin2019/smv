import dynamic from 'next/dynamic';
import { Box, Tabs, Loader } from '@mantine/core';
import { useGlobalStore, DEFAULT_PAGE } from '@/stores/global_stores';

import PanelBottomManagement from './panel_bottom_management';
import { useEffect } from 'react';

const UserManagementMain = dynamic(
  () => import('@/components/pages/user_management/user_management_main'),
  { ssr: false, loading: () => <Loader size="sm" /> }
);

// Pages where the map is hidden
const HIDE_MAP_PAGES = [DEFAULT_PAGE, 'User Management'];

// navbarOpened is no longer needed, kept optional so existing callers don't break
export default function LayoutMain(_props: { navbarOpened?: boolean }) {
  const { activePage, setActivePage, auth } = useGlobalStore();
  const showMap = !HIDE_MAP_PAGES.includes(activePage);
  const isAdmin = auth?.role === 'admin';


  useEffect(() => {
    if (auth && !isAdmin && activePage === 'User Management') {
      setActivePage(DEFAULT_PAGE);
    }
  }, [auth, isAdmin, activePage, setActivePage]);

  return (
    <Box pos="relative" h="calc(100dvh - 50px)" style={{ overflow: 'hidden' }}>
      {/* Map stays mounted; only hidden on other pages */}
      <PanelBottomManagement showMap={showMap} />

      {/* Content for pages that don't show the map */}
      {!showMap && (
        <Box pos="absolute" inset={0} p="xs">
          <Tabs
            value={activePage}
            onChange={(value) => value && setActivePage(value)}
          >
            <Tabs.Panel value="Dashboard">First panel</Tabs.Panel>

            {isAdmin && (
              <Tabs.Panel value="User Management">
                <UserManagementMain />
              </Tabs.Panel>
            )}
          </Tabs>
        </Box>
      )}
    </Box>
  );
}