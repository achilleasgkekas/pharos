import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';

// Only the public-address policy is replaced, so a local HTTP server can exercise
// the real Node fetch/dispatcher interface without external network dependencies.
vi.mock('./ssrf', () => ({ assertPublicUrl: vi.fn(async () => {}), publicLookup: undefined }));
import { safeFetch } from './safeFetch';

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function listen(server: Server) {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server');
  return `http://127.0.0.1:${address.port}`;
}

it('uses a dispatcher compatible with the actual Node fetch implementation', async () => {
  const url = await listen(createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    req.pipe(res);
  }));
  const response = await safeFetch(url, { method: 'POST', body: 'transport check', signal: AbortSignal.timeout(3000) });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('transport check');
});

it('does not forward authorization or cookies to a different redirect origin', async () => {
  const destination = await listen(createServer((req, res) => {
    res.end(JSON.stringify({ authorization: req.headers.authorization, cookie: req.headers.cookie }));
  }));
  const source = await listen(createServer((_req, res) => {
    res.writeHead(302, { Location: destination });
    res.end();
  }));
  const response = await safeFetch(source, {
    headers: { Authorization: 'Bearer synthetic-token', Cookie: 'synthetic=value' },
    signal: AbortSignal.timeout(3000),
  });
  expect(await response.json()).toEqual({});
});
