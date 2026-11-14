import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';
import { defineConfig } from 'vite';

const API_PORT = Number(process.env.MCPNEXUS_PORT || process.env.PORT) || 4317;

/**
 * Explicit loopback proxy for /api.
 *
 * Vite's http-proxy path fails with EADDRNOTAVAIL on some Windows + Node 24
 * combinations, even though plain sockets to the same address work. Proxying
 * with node:http keeps the dev UI same-origin (cookies just work) and is stable.
 */
function apiProxy(apiPort: number) {
  return {
    name: 'mcpnexus-api-proxy',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url || !req.url.startsWith('/api')) return next();

        const proxyRequest = http.request(
          {
            host: '127.0.0.1',
            port: apiPort,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: `127.0.0.1:${apiPort}` },
          },
          (proxyResponse: any) => {
            res.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
            proxyResponse.pipe(res);
          },
        );

        proxyRequest.on('error', () => {
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('content-type', 'application/json');
          }
          res.end(
            JSON.stringify({
              ok: false,
              error: 'The MCPNEXUS API is not reachable. Is it running on port ' + apiPort + '?',
            }),
          );
        });

        req.pipe(proxyRequest);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiProxy(API_PORT)],
  server: {
    host: '127.0.0.1',
    port: 5317,
    strictPort: false,
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
  },
});
