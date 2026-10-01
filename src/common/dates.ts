export function jakartaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function jakartaDayRange(value = jakartaDateString()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error('Date must use YYYY-MM-DD');
  const start = new Date(`${value}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function jakartaRange(dateFrom?: string, dateTo?: string) {
  const from = jakartaDayRange(dateFrom ?? jakartaDateString()).start;
  const toStart = jakartaDayRange(
    dateTo ?? dateFrom ?? jakartaDateString(),
  ).start;
  return { gte: from, lt: new Date(toStart.getTime() + 24 * 60 * 60 * 1000) };
}
