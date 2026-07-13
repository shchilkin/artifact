export function formatMicroUsd(value: string | null | undefined) {
  const amount = Number(value ?? 0) / 1_000_000;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatInteger(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

export function formatTimestamp(value: string | null | undefined) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

export function formatFeature(value: string) {
  return value.replaceAll('_', ' ');
}
