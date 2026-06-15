export function toCheckerEmail(name: string): string {
  const s = name.trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `c${Math.abs(h).toString(36)}@shelfchecker.local`;
}
