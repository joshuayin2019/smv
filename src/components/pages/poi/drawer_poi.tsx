import { useState } from 'react';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { Drawer, Button, Group } from '@mantine/core';

const NAVBAR_WIDTH = 250; // keep in sync with AppShell navbar width
const HEADER_HEIGHT = 50; // keep in sync with AppShell header height

const SIZE_NORMAL = '40%';
const SIZE_FULL = `calc(100dvh - ${HEADER_HEIGHT}px)`; // stops below the app header

export default function DrawerPoi({ navbarOpened }: { navbarOpened: boolean }) {
  const [opened, { open, close }] = useDisclosure(false);
  const [size, setSize] = useState<string>(SIZE_NORMAL);

  const isDesktop = useMediaQuery('(min-width: 48em)');
  const left = isDesktop && navbarOpened ? NAVBAR_WIDTH : 0;

  return (
    <>
      <Drawer
        opened={opened}
        onClose={close}
        position="bottom"
        title="Authentication"
        withOverlay={false}
        size={size}
        styles={{
          inner: {
            left,
            width: `calc(100% - ${left}px)`,
            transition: 'left 300ms ease, width 300ms ease',
          },
          content: {
            borderTop: '0.5px solid var(--mantine-color-gray-3)',
            transition: 'height 300ms ease',
          },
        }}
      >
        <Group gap="xs">
          <Button
            size="xs"
            variant={size === SIZE_NORMAL ? 'filled' : 'default'}
            onClick={() => setSize(SIZE_NORMAL)}
          >
            40%
          </Button>
          <Button
            size="xs"
            variant={size === SIZE_FULL ? 'filled' : 'default'}
            onClick={() => setSize(SIZE_FULL)}
          >
            100%
          </Button>
          <Button size="xs" variant="default" color="red" onClick={close}>
            Hide
          </Button>
        </Group>
      </Drawer>

      <Button variant="default" onClick={open}>
        Open Drawer
      </Button>
    </>
  );
}