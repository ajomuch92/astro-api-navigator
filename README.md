# Astro API Navigator

> **Ctrl+Click on any API call → jump directly to the handler** in your Astro (or Nuxt/Next.js) project.

---

## Features

- **Ctrl+Click navigation** from any API call to its handler function
- **Smart HTTP method detection** — jumps to `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` export specifically
- **Dynamic route support** — resolves `/api/users/42` → `pages/api/users/[id].ts`
- **Catch-all routes** — resolves `/api/files/a/b/c` → `pages/api/files/[...path].ts`
- **Hover tooltips** showing the resolved file, method, and dynamic params
- **Underline decoration** on all resolvable API URLs in the editor
- **Multi-framework support**:
  - Astro (`src/pages/api/`)
  - Nuxt 3 (`server/api/`) ← configure via settings
  - Next.js App Router (`app/api/`) ← configure via settings

### Supported call patterns

| Pattern | Example |
|---|---|
| `fetch()` | `fetch('/api/users')` |
| `$fetch()` | `$fetch('/api/users', { method: 'POST' })` |
| `axios.method()` | `axios.get('/api/posts/1')` |
| `axios({ url })` | `axios({ url: '/api/posts', method: 'PUT' })` |
| `useFetch()` | `useFetch('/api/data')` |
| `useQuery()` | `useQuery(['key', '/api/items'])` |
| `useSWR()` | `useSWR('/api/profile', fetcher)` |
| `ky` | `ky.post('/api/submit').json()` |
| `wretch` | `wretch('/api/upload').post(data)` |

### Supported file types

Works when editing `.ts`, `.js`, `.tsx`, `.jsx`, `.vue`, and `.astro` files.

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
| `astroApiNavigator.pagesDir` | `src/pages` | Path to Astro pages directory |

### Examples for other frameworks

**Nuxt 3** (server routes in `server/api/`):
```json
{
  "astroApiNavigator.pagesDir": "server"
}
```

**Next.js App Router** (`app/api/`):
```json
{
  "astroApiNavigator.pagesDir": "app"
}
```

---

## Project structure examples

### Static routes
```
fetch('/api/users')           →  src/pages/api/users.ts
fetch('/api/health')          →  src/pages/api/health.js
fetch('/api/posts')           →  src/pages/api/posts/index.ts
```

### Dynamic routes
```
fetch('/api/posts/42')        →  src/pages/api/posts/[id].ts       (params: id=42)
fetch('/api/users/7/comments')→  src/pages/api/users/[id]/comments.ts  (params: id=7)
```

### Catch-all routes
```
fetch('/api/files/docs/a.pdf')→  src/pages/api/files/[...path].ts  (params: path=docs/a.pdf)
```

### HTTP method detection
```ts
// In your component:
axios.post('/api/users', data)
//         ^^^^^^^^^^^
//         Ctrl+Click → jumps to `export function POST(...)` in users.ts

fetch('/api/users', { method: 'DELETE' })
//         ^^^^^^^^^^^
//         Ctrl+Click → jumps to `export function DELETE(...)` in users.ts
```

---

## Handler file examples

### Astro API route (`src/pages/api/users.ts`)
```ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const users = await db.users.findAll();
  return new Response(JSON.stringify(users));
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const user = await db.users.create(body);
  return new Response(JSON.stringify(user), { status: 201 });
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
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode
npm run watch

# Run tests
npm test

# Package the extension
npm run package
```

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.

---

## License

MIT