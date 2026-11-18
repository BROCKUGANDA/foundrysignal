export function slugifyWorkspace(input: string): string {
  const base = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base.length >= 3 ? base.slice(0, 48) : `ws-${Date.now().toString(36)}`;
}

export function slugifyVenture(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base.length >= 2 ? base.slice(0, 60) : `venture-${Date.now().toString(36)}`;
}

export function slugifyFounder(name: string): string {
  return slugifyVenture(name);
}
