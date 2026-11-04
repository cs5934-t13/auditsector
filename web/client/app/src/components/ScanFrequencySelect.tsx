import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import {
  SCAN_FREQUENCIES,
  scanFrequencyOption,
  type ScanFrequency,
} from '../content/frequencies';

interface ScanFrequencySelectProps {
  /** Currently selected frequency. */
  value: ScanFrequency;
  onChange: (value: ScanFrequency) => void;
  /** Base id for the label and select, so multiple selectors can coexist. */
  id?: string;
  disabled?: boolean;
}

/**
 * Selector for how often a source/audit report is scanned.
 *
 * Accessibility notes:
 * - `InputLabel` is associated with the `Select` through `labelId`/`label`.
 * - The selected option's description is exposed as helper text and linked via
 *   `aria-describedby`, so the meaning of each frequency is announced too.
 */
export default function ScanFrequencySelect({
  value,
  onChange,
  id = 'scan-frequency',
  disabled = false,
}: ScanFrequencySelectProps) {
  const labelId = `${id}-label`;
  const helperId = `${id}-helper`;
  const selected = scanFrequencyOption(value);

  const handleChange = (event: SelectChangeEvent<ScanFrequency>) => {
    onChange(event.target.value as ScanFrequency);
  };

  return (
    <FormControl fullWidth disabled={disabled} sx={{ maxWidth: 320 }}>
      <InputLabel id={labelId}>Scan frequency</InputLabel>
      <Select<ScanFrequency>
        id={id}
        labelId={labelId}
        label="Scan frequency"
        value={value}
        onChange={handleChange}
        aria-describedby={helperId}
      >
        {SCAN_FREQUENCIES.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      <FormHelperText id={helperId}>{selected.description}</FormHelperText>
    </FormControl>
  );
}
