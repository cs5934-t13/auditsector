import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CodeIcon from '@mui/icons-material/Code';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  sanitizeRichText,
} from '../utils/richtext';
import { LINK_ACCENT } from '../theme';

type InlineCommand = 'bold' | 'italic' | 'underline';
type BlockCommand = 'insertUnorderedList' | 'insertOrderedList';

interface ToolbarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  unorderedList: boolean;
  orderedList: boolean;
}

const EMPTY_STATE: ToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  unorderedList: false,
  orderedList: false,
};

/**
 * Maps the browser's `execCommand` style name onto the tags the sanitizer keeps.
 *
 * Chrome/Blink tends to emit `<b>`/`<i>`; Firefox emits `<b>`/`<i>` too, while
 * some engines emit `<span style="...">`. Normalizing keeps the stored HTML
 * predictable and inside the allowed tag set (a `<span style>` would be stripped
 * on save, silently losing the formatting).
 */
function normalizeEditorHtml(html: string): string {
  return html
    // A styled span is the most common escape hatch; convert it to a tag.
    .replace(
      /<span style="[^"]*font-weight:\s*(?:bold|[6-9]00)[^"]*">([\s\S]*?)<\/span>/gi,
      '<strong>$1</strong>',
    )
    .replace(
      /<span style="[^"]*font-style:\s*italic[^"]*">([\s\S]*?)<\/span>/gi,
      '<em>$1</em>',
    )
    // A `text-decoration: underline` span has no tag equivalent in Blink, so
    // it becomes `<u>`.
    .replace(
      /<span style="[^"]*text-decoration:\s*underline[^"]*">([\s\S]*?)<\/span>/gi,
      '<u>$1</u>',
    )
    .replace(/<b>/gi, '<strong>')
    .replace(/<\/b>/gi, '</strong>')
    .replace(/<i>/gi, '<em>')
    .replace(/<\/i>/gi, '</em>');
}

/**
 * Turns the browser's editor output into a single normalized HTML string.
 *
 * Empty block placeholders (`<p><br></p>`, an empty list) collapse to an empty
 * string so the "required" check and the fallback logic treat "no content" as
 * absent.
 */
function serialize(html: string): string {
  const normalized = normalizeEditorHtml(html);
  const trimmed = normalized.trim();

  if (!trimmed) {
    return '';
  }

  const sanitized = sanitizeRichText(trimmed);
  return sanitized === '<p></p>' || sanitized === '<p><br></p>' ? '' : sanitized;
}

interface RichTextEditorProps {
  id: string;
  label: string;
  value: string;
  onChange: (html: string) => void;
  helperText?: string;
  placeholder?: string;
  minRows?: number;
  required?: boolean;
}

interface ToggleSpec {
  command: InlineCommand | BlockCommand;
  label: string;
  shortcut?: string;
  /** Accessible name should describe the current state, not just the glyph. */
  icon: string;
}

const INLINE_TOGGLES: ToggleSpec[] = [
  { command: 'bold', label: 'Bold', shortcut: 'Ctrl+B', icon: 'B' },
  { command: 'italic', label: 'Italic', shortcut: 'Ctrl+I', icon: 'I' },
  { command: 'underline', label: 'Underline', shortcut: 'Ctrl+U', icon: 'U' },
];

const BLOCK_TOGGLES: ToggleSpec[] = [
  { command: 'insertUnorderedList', label: 'Bulleted list', icon: '•' },
  { command: 'insertOrderedList', label: 'Numbered list', icon: '1.' },
];

/**
 * A small, formatting-only WYSIWYG editor for the administrator settings.
 *
 * Design notes:
 * - Built on `contentEditable` + `document.execCommand`. The command set is
 *   deprecated but universally implemented, and it avoids adding a large editor
 *   dependency to the app bundle. Only bold, italic, underline, lists, and links
 *   are exposed, so the stored HTML stays inside the sanitizer's whitelist.
 * - The value is HTML. It is normalized and sanitized on every change, so what
 *   the parent stores is already safe and stable.
 * - `dangerouslySetInnerHTML` is used only to seed and re-sync the editable
 *   region. It is fed `sanitizeRichText(value)`, never raw input.
 * - Toolbar buttons must not steal focus from the editable region, or
 *   `execCommand` has no selection to act on: each uses `onMouseDown` with
 *   `preventDefault`.
 * - The "HTML" button swaps the rich editor for a plain text area holding the
 *   source, so an administrator can inspect or paste exact markup. While typing
 *   there the raw text is passed through untouched (sanitizing per keystroke
 *   would append closing tags and move the caret); it is sanitized on blur and
 *   again when the form saves.
 */
export default function RichTextEditor({
  id,
  label,
  value,
  onChange,
  helperText,
  placeholder,
  minRows = 3,
  required = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // The last HTML we emitted. Used to avoid resetting the caret when the parent
  // echoes our own change back to us. `null` means "nothing has been written
  // yet", which forces the first effect run to seed the region — initializing
  // this to `value` would make the first run a no-op and leave the editor blank.
  const lastEmitted = useRef<string | null>(null);
  // The element instance that `lastEmitted` was written into. Toggling the HTML
  // view unmounts and remounts the editable region, so a new element starts
  // empty and must be seeded even when `value` has not changed.
  const seededElement = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<ToolbarState>(EMPTY_STATE);
  const [focused, setFocused] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  // Range captured when the dialog opens. React re-renders (and the dialog takes
  // focus) destroy the live selection, so `execCommand` would have nothing to
  // act on when Apply is pressed.
  const linkRange = useRef<Range | null>(null);
  /** When true the source text area replaces the rich editor. */
  const [showHtml, setShowHtml] = useState(false);
  /** Raw source while the text area is being typed in. */
  const [draftHtml, setDraftHtml] = useState('');
  const helperId = `${id}-helper-text`;
  const htmlHintId = `${id}-html-hint`;
  const labelId = `${id}-label`;
  const linkInputId = useId();
  const htmlInputId = useId();

  // Seed the region, and re-sync only when the value came from somewhere other
  // than this editor (Reset, an external load). Writing innerHTML when we
  // already show the value would move the caret to the start on every keystroke.
  useEffect(() => {
    const element = editorRef.current;
    if (!element) {
      return;
    }

    const safe = sanitizeRichText(value);
    const isNewElement = seededElement.current !== element;

    if (!isNewElement && safe === lastEmitted.current) {
      return;
    }

    element.innerHTML = safe;
    lastEmitted.current = safe;
    seededElement.current = element;
  }, [value, showHtml]);

  // Opening the HTML view seeds the text area from the current value. It also
  // re-seeds when the value changes while the view is closed, so switching back
  // never shows a stale copy.
  useEffect(() => {
    if (showHtml) {
      return;
    }

    setDraftHtml(sanitizeRichText(value));
  }, [value, showHtml]);

  const readSelectionState = useCallback(() => {
    const element = editorRef.current;
    if (!element) {
      return;
    }

    // `queryCommandState` reports the formatting at the caret. It is a no-op
    // outside a focused editing host, so guard on focus to avoid stale output.
    if (document.activeElement !== element) {
      return;
    }

    setState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
    });
  }, []);

  const emit = useCallback(() => {
    const element = editorRef.current;
    if (!element) {
      return;
    }

    const html = serialize(element.innerHTML);
    lastEmitted.current = html;
    onChange(html);
  }, [onChange]);

  const run = useCallback(
    (command: string, argument?: string) => {
      const element = editorRef.current;
      if (!element) {
        return;
      }

      element.focus();
      // `execCommand` is intentionally used: it preserves the native undo stack
      // and handles the selection, which a manual DOM range edit would not.
      document.execCommand(command, false, argument);
      emit();
      readSelectionState();
    },
    [emit, readSelectionState],
  );

  /** Keeps the caret where it is while the toolbar button is pressed. */
  const keepSelection = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  const openLinkDialog = () => {
    const element = editorRef.current;
    const selection = window.getSelection();
    const selected = selection?.toString() ?? '';

    // Remember the caret/selection so Apply can act on it after the dialog has
    // taken focus. Only a range that lives inside this editor is kept.
    linkRange.current = null;
    if (selection && selection.rangeCount > 0 && element) {
      const range = selection.getRangeAt(0);
      if (element.contains(range.commonAncestorContainer)) {
        linkRange.current = range.cloneRange();
      }
    }

    // Pre-fill from a link the caret sits in, otherwise from the selected text,
    // so the button is useful both for creating and editing a link.
    const anchor = element?.querySelector('a[href]');
    setLinkValue(anchor?.getAttribute('href') ?? selected.trim());
    setLinkOpen(true);
  };

  const applyLink = () => {
    const href = linkValue.trim();
    const element = editorRef.current;

    setLinkOpen(false);
    if (!element) {
      return;
    }

    element.focus();

    // Restore the captured range, or fall back to the end of the content when
    // there was no selection (an empty editor, or focus lost to the dialog).
    const selection = window.getSelection();
    const range = linkRange.current;
    linkRange.current = null;

    if (selection) {
      selection.removeAllRanges();
      if (range && element.contains(range.commonAncestorContainer)) {
        selection.addRange(range);
      } else {
        const end = document.createRange();
        end.selectNodeContents(element);
        end.collapse(false);
        selection.addRange(end);
      }
    }

    if (!href) {
      document.execCommand('unlink');
      emit();
      return;
    }

    // With a collapsed caret, `createLink` has nothing to wrap, so insert the
    // address as its own link text instead.
    if (selection && selection.isCollapsed) {
      // Escape the address before it becomes markup and text content.
      const label = href
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${label}">${label}</a>`,
      );
    } else {
      document.execCommand('createLink', false, href);
    }

    emit();
    readSelectionState();
  };

  const activeCommands = new Set<string>();
  if (state.bold) activeCommands.add('bold');
  if (state.italic) activeCommands.add('italic');
  if (state.underline) activeCommands.add('underline');

  /**
   * Writes typed source back to the parent unchanged.
   *
   * Sanitizing on every keystroke would append closing tags mid-word and jump
   * the caret, so the raw text is kept until blur or save.
   */
  const handleHtmlChange = (html: string) => {
    setDraftHtml(html);
    lastEmitted.current = html;
    onChange(html);
  };

  /** Sanitizes the source once editing stops, so the field ends in a valid state. */
  const commitHtml = () => {
    const cleaned = sanitizeRichText(draftHtml);
    setDraftHtml(cleaned);
    lastEmitted.current = cleaned;
    onChange(cleaned);
  };

  const toggleHtmlView = () => {
    if (showHtml) {
      commitHtml();
      setShowHtml(false);
      return;
    }

    // Entering: start from what the rich editor is showing right now.
    setDraftHtml(sanitizeRichText(editorRef.current?.innerHTML ?? value));
    setShowHtml(true);
  };

  return (
    <Box>
      <InputLabel
        id={labelId}
        htmlFor={id}
        required={required}
        sx={{ mb: 0.75, fontWeight: 600, fontSize: '0.95rem' }}
      >
        {label}
      </InputLabel>

      <Box
        sx={{
          border: 1,
          borderColor: focused ? LINK_ACCENT : 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
          transition: 'border-color 120ms ease',
        }}
      >
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
          sx={{
            px: 1,
            py: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
            flexWrap: 'wrap',
          }}
          // The toolbar is supplementary to the editable region, which carries
          // the real label/help association.
          role="toolbar"
          aria-label={`${label} formatting`}
        >
          {INLINE_TOGGLES.map((toggle) => (
            <Tooltip key={toggle.command} title={toggle.shortcut ?? toggle.label} disableInteractive>
              <ToggleButton
                size="small"
                value={toggle.command}
                // Each button owns one command, so it is toggled directly rather
                // than through a group: a non-exclusive `ToggleButtonGroup` hands
                // `onChange` an array, and an exclusive one would clear the other
                // active styles. `aria-pressed` reports the caret's real state.
                selected={activeCommands.has(toggle.command)}
                onChange={() => run(toggle.command)}
                onMouseDown={keepSelection}
                aria-label={toggle.label}
                sx={{ px: 1.25, py: 0.25, minWidth: 36 }}
              >
                <Box
                  component="span"
                  sx={{
                    fontWeight: toggle.command === 'bold' ? 800 : 600,
                    fontStyle: toggle.command === 'italic' ? 'italic' : 'normal',
                    textDecoration:
                      toggle.command === 'underline' ? 'underline' : 'none',
                  }}
                >
                  {toggle.icon}
                </Box>
              </ToggleButton>
            </Tooltip>
          ))}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {BLOCK_TOGGLES.map((toggle) => {
            const active = toggle.command === 'insertUnorderedList'
              ? state.unorderedList
              : state.orderedList;

            return (
              <Tooltip key={toggle.command} title={toggle.label} disableInteractive>
                <ToggleButton
                  size="small"
                  value={toggle.command}
                  selected={active}
                  onChange={() => run(toggle.command)}
                  onMouseDown={keepSelection}
                  aria-label={toggle.label}
                  sx={{ px: 1.25, py: 0.25, minWidth: 36, fontWeight: 700 }}
                >
                  {toggle.icon}
                </ToggleButton>
              </Tooltip>
            );
          })}

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <Button
            size="small"
            variant="text"
            onMouseDown={keepSelection}
            onClick={openLinkDialog}
            aria-label="Insert or edit link"
            sx={{ minWidth: 0, px: 1.25, py: 0.25, textTransform: 'none' }}
          >
            Link
          </Button>

          {/* Pushes the view toggle to the far right, so it reads as a mode
              switch rather than another formatting command. */}
          <Box sx={{ flexGrow: 1 }} />

          <Button
            size="small"
            variant={showHtml ? 'contained' : 'text'}
            onClick={toggleHtmlView}
            aria-pressed={showHtml}
            aria-label={
              showHtml
                ? 'Show the formatted editor'
                : 'Show and edit the HTML source'
            }
            startIcon={<CodeIcon aria-hidden="true" />}
            sx={{ minWidth: 0, px: 1.25, py: 0.25, textTransform: 'none' }}
          >
            HTML
          </Button>
        </Stack>

        {showHtml ? (
          <Box
            component="textarea"
            id={htmlInputId}
            value={draftHtml}
            onChange={(event) => handleHtmlChange(event.target.value)}
            onBlur={commitHtml}
            spellCheck={false}
            aria-labelledby={labelId}
            aria-describedby={[helperText ? helperId : null, htmlHintId]
              .filter(Boolean)
              .join(' ')}
            aria-required={required || undefined}
            sx={{
              display: 'block',
              boxSizing: 'border-box',
              width: '100%',
              px: 1.75,
              py: 1.25,
              minHeight: `${minRows * 1.6 + 0.6}rem`,
              border: 0,
              outline: 'none',
              resize: 'vertical',
              bgcolor: 'transparent',
              color: 'text.primary',
              typography: 'body2',
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              fontSize: '0.85rem',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          />
        ) : (
          <Box
            ref={editorRef}
            id={id}
            role="textbox"
            aria-multiline="true"
            aria-labelledby={labelId}
            aria-describedby={helperText ? helperId : undefined}
            aria-required={required || undefined}
            contentEditable
            suppressContentEditableWarning
            onInput={emit}
            onBlur={() => {
              setFocused(false);
              setState(EMPTY_STATE);
              emit();
            }}
            onFocus={() => setFocused(true)}
            onKeyUp={readSelectionState}
            onMouseUp={readSelectionState}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                // `execCommand` handles the block split; let it, then sync state.
                window.setTimeout(readSelectionState, 0);
              }
            }}
            onPaste={(event) => {
              // Paste as plain text: pasted markup carries styles and tags the
              // sanitizer would strip, which looks like formatting silently
              // vanishing. Plain text keeps the result predictable.
              event.preventDefault();
              const text = event.clipboardData.getData('text/plain');
              document.execCommand('insertText', false, text);
              emit();
            }}
            sx={{
              px: 1.75,
              py: 1.25,
              minHeight: `${minRows * 1.6 + 0.6}rem`,
              outline: 'none',
              typography: 'body1',
              color: 'text.primary',
              '& p': { m: 0, mb: 0.75 },
              '& p:last-child': { mb: 0 },
              '& ul, & ol': { m: 0, mb: 0.75, pl: 3 },
              '& li': { mb: 0.25 },
              '& a': { color: LINK_ACCENT, textDecoration: 'underline' },
              '&:empty::before': {
                content: 'attr(data-placeholder)',
                color: 'text.secondary',
              },
            }}
            data-placeholder={placeholder ?? ''}
          />
        )}
      </Box>

      {showHtml && (
        <FormHelperText id={htmlHintId} sx={{ mx: 1.75, mt: 0.75 }}>
          Editing the HTML source. Only the supported tags are kept.{' '}
          <Button
            size="small"
            variant="text"
            onClick={commitHtml}
            sx={{ minWidth: 0, p: 0, ml: 0.5, textTransform: 'none' }}
          >
            Clean up formatting
          </Button>
        </FormHelperText>
      )}

      {helperText && (
        <FormHelperText id={helperId} sx={{ mx: 1.75, mt: 0.75 }}>
          {helperText}
        </FormHelperText>
      )}

      <Dialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        aria-labelledby={`${id}-link-title`}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id={`${id}-link-title`}>Link</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Use a full address (https://…) or a mailto: link. Leave empty to
            remove the link.
          </Typography>
          <TextField
            id={linkInputId}
            label="Address"
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            placeholder="https://example.gov"
            fullWidth
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyLink();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={applyLink}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
