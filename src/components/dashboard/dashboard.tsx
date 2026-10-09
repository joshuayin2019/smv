import { AppShell, Burger, Group, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';



import LayoutHeader from './layout_header';
import LayoutNavbar from './layout_navbar';


export default function Dashboard() {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure();
  const [desktopOpened, { toggle: toggleDesktop }] = useDisclosure(true);

  return (

    <AppShell
      padding="md"
      header={{ height: 50 }}
      navbar={{
        width: 250,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened, desktop: !desktopOpened },
      }}
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
        
        <Text>This is the main section, your app content here.</Text>
        <Text>The navbar is collapsible both on mobile and desktop. Nice!</Text>
        <Text>Mobile and desktop opened state can be managed separately.</Text>
      </AppShell.Main>
    </AppShell>

  );
}
