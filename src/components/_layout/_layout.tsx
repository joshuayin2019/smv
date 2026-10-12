import { AppShell, Box } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';

import LayoutHeader from './layout_header';
import LayoutNavbar from './layout_navbar';
import LayoutMain from './layout_main';
import MapDataManagement from './map_data_management';

export default function LayoutParent() {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);

  return (
    <>
    <MapDataManagement />
  
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
        <LayoutMain />
      </AppShell.Main>
    </AppShell>
    </>
  );
}