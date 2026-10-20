/**
 * Instant, on-phone place matching: saved Home / Work and the built-in
 * landmarks, before (or without) any network search.
 */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Places where every typed word starts a word of the name or area, saved places first. */
export function localMatches(query, places, limit = 6) {
  const words = norm(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  return (Array.isArray(places) ? places : [])
    .filter((p) => {
      const hay = norm(`${p.label} ${p.shortLabel || ''} ${p.source || ''} ${p.id || ''}`).split(' ');
      return words.every((w) => hay.some((h) => h.startsWith(w)));
    })
    .slice(0, limit);
}

/** Merge on-phone matches with server results, dropping near-duplicates (same name). */
export function mergeResults(local, remote, limit = 8) {
  const seen = new Set(local.map((p) => norm(p.label)));
  const extra = (Array.isArray(remote) ? remote : []).filter((p) => {
    const k = norm(p.label);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return [...local, ...extra].slice(0, limit);
}
