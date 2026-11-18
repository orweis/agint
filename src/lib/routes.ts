type Query = Record<string, string | undefined>;

function withQuery(path: string, query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** Every in-app path, built in one place so pages, redirects and MCP links agree. */
export const routes = {
  home: () => "/",
  signIn: (next?: string) => withQuery("/sign-in", { next }),
  signUp: (next?: string) => withQuery("/sign-up", { next }),
  networks: () => "/networks",
  network: (slug: string) => `/n/${slug}`,
  sources: (slug: string) => `/n/${slug}/sources`,
  leads: (slug: string, state?: string) => withQuery(`/n/${slug}/leads`, { state }),
  activity: (slug: string) => `/n/${slug}/activity`,
  connect: (slug: string) => `/n/${slug}/connect`,
  entity: (slug: string, id: string) => `/n/${slug}/e/${id}`,
  mcp: () => "/mcp",
  report: () => "/api/report",
};
