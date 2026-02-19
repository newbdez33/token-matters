import dayjs from 'dayjs';

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatCost(amount: number, currency = 'USD'): string {
  if (currency === 'USD') return `$${amount.toFixed(2)}`;
  if (currency === 'CNY') return `¥${amount.toFixed(2)}`;
  return `${amount.toFixed(2)} ${currency}`;
}

export function formatCostCompact(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toFixed(2)}`;
}

export function formatDate(date: string, template = 'MMM D, YYYY'): string {
  return dayjs(date).format(template);
}

export function formatDateShort(date: string): string {
  return dayjs(date).format('MM/DD');
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}
