export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toFixed(decimals);
}

// Blur-aware formatting functions
export function formatCurrencyBlurred(value: number, blur: boolean): string {
  if (blur) return '$***.**';
  return formatCurrency(value);
}

export function formatPercentBlurred(value: number, blur: boolean): string {
  if (blur) return '**.**%';
  return formatPercent(value);
}

export function formatNumberBlurred(value: number, blur: boolean, decimals = 0): string {
  if (blur) return '***';
  return formatNumber(value, decimals);
}
