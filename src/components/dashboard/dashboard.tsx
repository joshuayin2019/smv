import dynamic from "next/dynamic";
import { AppShell, Box } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

import LayoutHeader from './layout_header';
import LayoutNavbar from './layout_navbar';
import { useGlobalStore, DEFAULT_PAGE } from '@/stores/global_stores';

const Map = dynamic(() => import('@/components/map/map'), { ssr: false });

// Pages where the map is visible
const HIDE_MAP_PAGES = [DEFAULT_PAGE, 'User Management'];

export default function Dashboard() {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);
  const activePage = useGlobalStore((s) => s.activePage);
  const showMap = !HIDE_MAP_PAGES.includes(activePage);



  return (
    <AppShell
      header={{ height: 50 }}
      navbar={{
        width: 250,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      transitionDuration={200}
      transitionTimingFunction="ease"
    >
      <AppShell.Header>
        <LayoutHeader
          mobileOpened={mobileOpened}
          toggleMobile={toggleMobile}
          desktopOpened={desktopOpened}
          toggleDesktop={toggleDesktop}
        />
      </AppShell.Header>

      <AppShell.Navbar p={0}>
        <LayoutNavbar />
      </AppShell.Navbar>

      <AppShell.Main>
        <Box pos="relative" h="calc(100dvh - 50px)">
          {/* Map stays mounted; only hidden on other pages */}
          <Box
            pos="absolute"
            inset={0}
            style={{
              visibility: showMap ? 'visible' : 'hidden',
              pointerEvents: showMap ? 'auto' : 'none',
            }}
          >
            <Map active={showMap} />
          </Box>

          {/* Content for pages that don't show the map */}
          {!showMap && (
            <Box pos="absolute" inset={0} p="md" bg="white">
              {activePage}
            </Box>
          )}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}