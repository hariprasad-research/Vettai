// Shared pure utilities for VETTAI. No DOM or application state dependencies.
export function esc(value = '') { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
export function ageAtMatch(dob, matchDate = '2026-10-25') {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00`); const event = new Date(`${matchDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = event.getFullYear() - birth.getFullYear();
  if (event.getMonth() < birth.getMonth() || (event.getMonth() === birth.getMonth() && event.getDate() < birth.getDate())) age--;
  return age;
}
export function dateLabel(value) { if (!value) return '—'; return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)); }
export function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
export function nextId(collection, prefix, length = 4) { const largest = collection.reduce((max, record) => Math.max(max, Number(String(record.id).replace(prefix, '')) || 0), 0); return `${prefix}${String(largest + 1).padStart(length, '0')}`; }
