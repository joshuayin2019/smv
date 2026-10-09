import { Group, Burger, Text } from '@mantine/core';

// 1. Define the props interface
interface LayoutHeaderProps {
  mobileOpened: boolean;
  toggleMobile: () => void;
  desktopOpened: boolean;
  toggleDesktop: () => void;
}

// 2. Apply the interface to the component props
export default function LayoutHeader(props: LayoutHeaderProps) {
  const { mobileOpened, toggleMobile, desktopOpened, toggleDesktop } = props;   
  return (
    <Group 
        bg="#000e47"
        h="100%" 
        px="md" 
        gap="xs"
    >


      <Burger
        color="#fff"
        opened={mobileOpened}
        onClick={toggleMobile}
        hiddenFrom="sm"
        size="sm"
      />
      <Burger
        color="#fff"
        opened={desktopOpened}
        onClick={toggleDesktop}
        visibleFrom="sm"
        size="sm"
      />
      <Text c="#fff">
        SMV Web Application
      </Text>
    </Group>
  );
}