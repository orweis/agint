import { formatDateTime, relativeTime } from "@/lib/format";

/** A relative time ("3 hours ago") with the exact UTC time on hover and in `dateTime`. */
export function RelativeTime({ value, now, className }: { value: Date | string; now: Date; className?: string }) {
  const date = value instanceof Date ? value : new Date(value);
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)} className={className}>
      {relativeTime(date, now)}
    </time>
  );
}
