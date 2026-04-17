# Astro API Navigator

> **Ctrl+Click on any API call → jump directly to the handler** in your Astro, SvelteKit, Nuxt, or Next.js project.

---

## Features

- **Ctrl+Click navigation** from any API call to its handler function
- **Smart HTTP method detection** — jumps to the exact `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` export
- **Template literal support** — resolves dynamic URLs like `` `/api/users/${id}/comments` `` to the correct handler
- **Dynamic route support** — resolves `/api/users/42` → `pages/api/users/[id].ts`
- **Catch-all routes** — resolves `/api/files/a/b/c` → `pages/api/files/[...path].ts`
- **Hover tooltips** showing the resolved file, method, dynamic params, and template skeleton
- **Underline decoration** on all resolvable API URLs in the editor
- **Multi-framework support**: Astro, SvelteKit, Vue/Nuxt, React/Next.js

---

## Supported call patterns

| Pattern | Example |
|---|---|
| `fetch()` | `fetch('/api/users')` |
| `fetch()` template | `` fetch(`/api/users/${id}`) `` |
| `$fetch()` | `$fetch('/api/users', { method: 'POST' })` |
| `axios.method()` | `axios.get('/api/posts/1')` |
| `axios({ url })` | `axios({ url: '/api/posts', method: 'PUT' })` |
| `useFetch()` | `useFetch('/api/data')` |
| `useQuery()` | `useQuery(['key', '/api/items'])` |
| `useSWR()` | `useSWR('/api/profile', fetcher)` |
| `ky` | `ky.post('/api/submit').json()` |
| `wretch` | `wretch('/api/upload').post(data)` |

All patterns above also support template literals with `${...}` interpolations.

---

## Template literal URLs

URLs with interpolations are fully supported. The extension strips query strings and resolves interpolated path segments as dynamic route params:

```ts
// Query string interpolation — strip ?... and resolve to /api/dependencies
fetch(`/api/dependencies?package=${pkg}`)

// Path segment interpolation — resolves to /api/users/[id]/comments
fetch(`/api/users/${userId}/comments`)

// Multiple interpolations
axios.get(`/api/${section}/${id}`)  // -> /api/[section]/[id].ts or similar
```

The hover tooltip shows both the raw template and the resolved static skeleton so you always know what file it maps to.

---

## Supported file types

Works when **editing** `.ts`, `.js`, `.tsx`, `.jsx`, `.vue`, `.svelte`, and `.astro` files.

---

## Usage

1. Open any file that makes API calls (component, page, store, etc.)
2. **Hover** over an `/api/...` URL to preview where it leads
3. **Ctrl+Click** (or **F12** with cursor on the URL) to jump there

The extension opens the handler file and positions the cursor at the correct exported function.

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `astroApiNavigator.pagesDir` | `src/pages` | Path to the pages/routes directory |

### Framework presets

**Astro** (default):
```json
{ "astroApiNavigator.pagesDir": "src/pages" }
```

**SvelteKit**:
```json
{ "astroApiNavigator.pagesDir": "src/routes" }
```

**Nuxt 3**:
```json
{ "astroApiNavigator.pagesDir": "server" }
```

**Next.js App Router**:
```json
{ "astroApiNavigator.pagesDir": "app" }
```

---

## Route resolution examples

### Static routes
```
fetch('/api/users')            ->  src/pages/api/users.ts
fetch('/api/health')           ->  src/pages/api/health.js
fetch('/api/posts')            ->  src/pages/api/posts/index.ts
```

### Dynamic routes
```
fetch('/api/posts/42')         ->  src/pages/api/posts/[id].ts        (params: id=42)
fetch('/api/users/7/comments') ->  src/pages/api/users/[id]/comments.ts  (params: id=7)
```

### Template literal routes
```
fetch(`/api/dependencies?package=${pkg}`)   ->  src/pages/api/dependencies.ts
fetch(`/api/users/${id}/comments`)          ->  src/pages/api/users/[id]/comments.ts
axios.get(`/api/${section}/${itemId}`)      ->  src/pages/api/[section]/[itemId].ts
```

### Catch-all routes
```
fetch('/api/files/docs/a.pdf') ->  src/pages/api/files/[...path].ts   (params: path=docs/a.pdf)
```

---

## Handler file examples

### Astro API route (`src/pages/api/users.ts`)
```ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  return new Response(JSON.stringify(await getUsers()));
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  return new Response(JSON.stringify(await createUser(body)), { status: 201 });
};
```

### SvelteKit server route (`src/routes/api/users/+server.ts`)
```ts
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request }) => {
  return new Response(JSON.stringify(await getUsers()));
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  return new Response(JSON.stringify(await createUser(body)), { status: 201 });
};
```

### Nuxt 3 server route (`server/api/users.ts`)
```ts
export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  if (method === 'POST') {
    const body = await readBody(event);
    return await createUser(body);
  }
  return await getUsers();
});
```

### Next.js App Router (`app/api/users/route.ts`)
```ts
export async function GET(request: Request) {
  return Response.json(await getUsers());
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json(await createUser(body), { status: 201 });
}
```

---

## Development

```bash
npm install          # install dependencies
npm run watch        # recompile on save
npm test             # run tests
npx vsce package --no-dependencies --allow-missing-repository  # build .vsix
```

Press **F5** in VS Code to open an Extension Development Host with the extension loaded.

---

## License

MIT