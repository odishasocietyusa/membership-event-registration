export function formatDate(
  date: string | Date | null | undefined,
  fallback = 'N/A',
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }
): string {
  if (!date) return fallback
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return fallback
  return d.toLocaleDateString('en-US', options)
}
