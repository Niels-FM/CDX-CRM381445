export const formatMoney = (v: number | null | undefined) =>
  v === null || v === undefined ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: 0 });
