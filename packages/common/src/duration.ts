export type ISODuration = string; // e.g. "PT30M" = 30 minutes

export const isoDurationToMinutes = (iso: ISODuration): number => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  return parseInt(m[1] || "0") * 60 + parseInt(m[2] || "0");
};

export const formatDuration = (iso: ISODuration): string => {
  const min = isoDurationToMinutes(iso);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};
