// Formats an ISO date-only string ("yyyy-MM-dd", as returned by SagaLogDayResponse.date — see
// @/types/saga-log) as "dd/MM/yyyy". Done via plain string manipulation rather than
// `new Date(iso).toLocaleDateString(...)`: a date-only ISO string is parsed as UTC midnight by
// the Date constructor, which can shift the displayed calendar day by ±1 depending on the
// browser's local timezone offset relative to UTC — string slicing sidesteps that entirely,
// since the day is already the correct Asia/Ho_Chi_Minh calendar day (NFR6, order-service's JVM
// default timezone).
export function formatIsoDateVi(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}
