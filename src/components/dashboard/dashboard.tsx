import dynamic from "next/dynamic";
import { AppShell, Burger, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';



import LayoutHeader from './layout_header';
import LayoutNavbar from './layout_navbar';

const Map = dynamic(() => import('@/components/map/map'), { ssr: false });

export default function Dashboard() {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);

  return (

    <AppShell
      header={{ height: 50 }}
      navbar={{
        width: 250,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
      transitionDuration={200} //300
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
        <Map />
      </AppShell.Main>
    </AppShell>

  );
}
