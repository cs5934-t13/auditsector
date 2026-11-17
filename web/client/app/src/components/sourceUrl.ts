export function getSourceUrlError(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'Enter a source URL.'

  try {
    const url = new URL(trimmed)
    if (/^https?:\/\//i.test(trimmed) && url.hostname) return ''
  } catch {
    // Invalid addresses receive the same actionable format message below.
  }

  return 'Enter a complete URL starting with http:// or https://.'
}
