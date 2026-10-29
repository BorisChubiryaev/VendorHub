export const fmtDate = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '—');
export const fmtDateTime = (d?: string | null) => {
  if (!d) return '—';
  const [date, time] = d.split(' ');
  return `${fmtDate(date)} ${time?.slice(0, 5) ?? ''}`;
};
export const fmtMoney = (n?: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' ₽';
export const fmtRate = (n?: number | null) => (n == null ? '—' : `${new Intl.NumberFormat('ru-RU').format(n)} ₽/ч`);
export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};
export const years = (n?: number | null) => (n == null ? '—' : `${n} ${plural(Math.floor(n), 'год', 'года', 'лет')}`);
