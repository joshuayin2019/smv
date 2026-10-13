import { Box, Button, Group, Text, ActionIcon } from '@mantine/core';
import { IconMaximize, IconMinimize, IconX, IconCaretUp } from '@tabler/icons-react';

type PoiPanelProps = {
  onNormal: () => void;
  onFull: () => void;
  onHide: () => void;
};

export default function PoiPanel({ onNormal, onFull, onHide }: PoiPanelProps) {
  return (
    <Box
      h="100%"
      bg="white"
      style={{
        overflow: 'auto',
        borderTop: '0.5px solid var(--mantine-color-gray-3)',
      }}
    >
      {/* Header bar */}
      <Group
        justify="space-between"
        wrap="nowrap"
        px="xs"
        h={32}
        bg="gray.0"
        style={{
          flexShrink: 0,
          borderBottom: '0.5px solid var(--mantine-color-gray-3)',
        }}
      >
        <Text fz={11} fw={700} c="dark">
          Point of Interest
        </Text>

        <Group gap={4} wrap="nowrap">
          {/* 40% */}
          <ActionIcon variant="transparent" color="gray" onClick={onNormal}>
            <IconMinimize size={19} />
          </ActionIcon>

          {/* 100% */}
          <ActionIcon variant="transparent" color="gray" onClick={onFull}>
            <IconMaximize size={19} />
          </ActionIcon>

          {/* Hide */}
          <ActionIcon variant="transparent" color="gray" onClick={onHide}>
            <IconX size={19} />
          </ActionIcon>
        </Group>


      </Group>





      <Group gap="xs" m={0} p={0}>
        <Button size="xs" variant="default" onClick={onNormal}>
          40%
        </Button>
        <Button size="xs" variant="default" onClick={onFull}>
          100%
        </Button>
        <Button size="xs" variant="default" color="red" onClick={onHide}>
          Hide
        </Button>
      </Group>
    </Box>
  );
}


type PoiHideTabProps = {
  onShow: () => void;
};

export function PoiHideTab({ onShow }: PoiHideTabProps) {


  return(
    <Group
      justify="space-between"
      wrap="nowrap"
      px="xs"
      h={36}
      w={260}
      bg="#0a1f6b"
      onClick={onShow}
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',   // centers the tab horizontally
        bottom: 0,
        zIndex: 900,
        cursor: 'pointer',
        border: '0.5px solid var(--mantine-color-gray-4)',
        borderBottom: 'none',
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.15)',
      }}
    >
      <Text fz={12} fw={700} c="#fff" truncate>
        Point of Interest
      </Text>

      <ActionIcon
        variant="subtle"
        color="#fff"
        aria-label="Show Point of Interest panel"
        onClick={(e) => {
          e.stopPropagation();
          onShow();
        }}
      >
        <IconMaximize size={18} />
      </ActionIcon>
    </Group>
  );

}
