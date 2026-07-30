export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return getLocalDateKey(date);
}

export function getDateRange(endDateKey: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) =>
    addDays(endDateKey, index - days + 1),
  );
}

export function formatFullDate(dateKey: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(parseDateKey(dateKey));
}

export function formatShortDate(dateKey: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(parseDateKey(dateKey));
}

export function formatMonth(dateKey: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(parseDateKey(dateKey));
}

export function getMonthGrid(dateKey: string): Array<string | null> {
  const selected = parseDateKey(dateKey);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const mondayOffset = (first.getDay() + 6) % 7;
  const cells: Array<string | null> = Array.from(
    { length: mondayOffset },
    () => null,
  );

  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(getLocalDateKey(new Date(year, month, day)));
  }

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return getLocalDateKey(parseDateKey(value)) === value;
}

export function getBackupTimeKey(date = new Date()): string {
  const dateKey = getLocalDateKey(date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${dateKey}-${hours}${minutes}`;
}
