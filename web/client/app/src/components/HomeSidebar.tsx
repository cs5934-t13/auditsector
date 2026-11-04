import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SectionPanel from './SectionPanel';
import { HOME_SIDEBAR, type HomeSidebarItem } from '../content/homeSidebar';
import { ACCENT_WASH, LINK_ACCENT } from '../theme';

const HEADING_ID = 'home-sidebar-heading';

/** Resting/hover treatment shared by every rail entry. */
const ITEM_SX: SxProps<Theme> = {
  alignItems: 'flex-start',
  gap: 1,
  borderRadius: 1,
  color: 'text.primary',
  '&:hover': {
    bgcolor: ACCENT_WASH,
    color: LINK_ACCENT,
    // Let the supporting text and chevron pick up the accent on hover.
    '& .MuiListItemText-secondary, & .MuiSvgIcon-root': { color: 'inherit' },
  },
};

/** Label, supporting line, and affordance for one rail entry. */
function ItemContent({ item }: { item: HomeSidebarItem }) {
  return (
    <>
      <ListItemText
        primary={item.label}
        secondary={item.description}
        slotProps={{
          primary: { sx: { fontWeight: 600 } },
          secondary: { sx: { mt: 0.25 } },
        }}
      />
      <ChevronRightIcon
        fontSize="small"
        aria-hidden="true"
        sx={{ mt: 0.5, color: 'text.secondary' }}
      />
    </>
  );
}

/**
 * Right-hand "Quick links" rail for the homepage.
 *
 * Entries come from `content/homeSidebar.ts`, so sub content can be added
 * without touching this component. A `path` entry renders a router link; an
 * `anchor` entry renders a plain `href="#id"` link, because React Router's link
 * handler does not perform the browser's native scroll-to-anchor.
 *
 * Layout/accessibility notes:
 * - Rendered as `<nav>` labelled by its heading, giving a single landmark.
 * - The outer `Box` is the grid item and is pinned to the top of its cell
 *   (`alignSelf: start`) so the panel hugs its content instead of stretching to
 *   the height of the main column.
 * - Stacks beneath the main content on small screens rather than being hidden.
 */
export default function HomeSidebar({ sx }: { sx?: SxProps<Theme> }) {
  return (
    <Box sx={[{ alignSelf: 'start' }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <SectionPanel
        component="nav"
        aria-labelledby={HEADING_ID}
        sx={{ p: { xs: 2, md: 2.5 } }}
      >
        <Typography
          id={HEADING_ID}
          component="h2"
          variant="subtitle2"
          sx={{
            px: 1.5,
            mb: 1,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'text.secondary',
          }}
        >
          Quick links
        </Typography>

        <List component="ul" disablePadding>
          {HOME_SIDEBAR.map((item) => (
            <ListItem key={item.label} disablePadding>
              {item.path ? (
                <ListItemButton component={RouterLink} to={item.path} sx={ITEM_SX}>
                  <ItemContent item={item} />
                </ListItemButton>
              ) : (
                <ListItemButton
                  component="a"
                  href={`#${item.anchor}`}
                  sx={ITEM_SX}
                >
                  <ItemContent item={item} />
                </ListItemButton>
              )}
            </ListItem>
          ))}
        </List>
      </SectionPanel>
    </Box>
  );
}
