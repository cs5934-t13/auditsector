/**
 * Scan frequency options.
 *
 * Values match the `frequency` enum in the `POST /sources` API contract
 * (`docs/api/audit-sources.md`), so they can be sent to the backend unchanged.
 */
export type ScanFrequency = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface ScanFrequencyOption {
  value: ScanFrequency;
  label: string;
  /** Short explanation shown as helper text under the selector. */
  description: string;
}

export const SCAN_FREQUENCIES: readonly ScanFrequencyOption[] = [
  {
    value: 'HOURLY',
    label: 'Hourly',
    description: 'Check for new reports every hour.',
  },
  {
    value: 'DAILY',
    label: 'Daily',
    description: 'Check for new reports once a day.',
  },
  {
    value: 'WEEKLY',
    label: 'Weekly',
    description: 'Check for new reports once a week.',
  },
  {
    value: 'MONTHLY',
    label: 'Monthly',
    description: 'Check for new reports once a month.',
  },
] as const;

/** Default from the API contract. */
export const DEFAULT_SCAN_FREQUENCY: ScanFrequency = 'WEEKLY';

/** Returns the option for a given value, falling back to the default. */
export function scanFrequencyOption(
  value: ScanFrequency,
): ScanFrequencyOption {
  return (
    SCAN_FREQUENCIES.find((option) => option.value === value) ??
    SCAN_FREQUENCIES.find(
      (option) => option.value === DEFAULT_SCAN_FREQUENCY,
    )!
  );
}
