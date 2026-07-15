import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Dynamic reverse proxy: browser calls /api-proxy/..., Vite forwards to the
 * tenant host from X-Target-Server (or VITE_DEFAULT_SERVER_URL).
 */
function egainProxyPlugin(): Plugin {
  return {
    name: 'egain-dynamic-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api-proxy')) {
          next()
          return
        }

        try {
          const envDir =
            typeof server.config.envDir === 'string'
              ? server.config.envDir
              : process.cwd()
          await forwardToEgain(req, res, envDir)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Proxy error'
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: message }))
        }
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api-proxy')) {
          next()
          return
        }
        try {
          const envDir =
            typeof server.config.envDir === 'string'
              ? server.config.envDir
              : process.cwd()
          await forwardToEgain(req, res, envDir)
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Proxy error'
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: message }))
        }
      })
    },
  }
}

async function forwardToEgain(
  req: IncomingMessage,
  res: ServerResponse,
  envDir: string,
) {
  const env = loadEnv(process.env.NODE_ENV ?? 'development', envDir, '')
  const targetHeader = req.headers['x-target-server']
  const targetBase =
    (typeof targetHeader === 'string' && targetHeader) ||
    env.VITE_DEFAULT_SERVER_URL ||
    ''

  if (!targetBase) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error:
          'Missing X-Target-Server header and VITE_DEFAULT_SERVER_URL. Set a server URL on the login screen.',
      }),
    )
    return
  }

  let origin: URL
  try {
    origin = new URL(targetBase)
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: `Invalid target server URL: ${targetBase}` }))
    return
  }

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, Accept-Language, Authorization, X-egain-session, X-Target-Server',
    )
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.end()
    return
  }

  const incoming = new URL(req.url ?? '/', 'http://localhost')
  let proxyPath = incoming.pathname.replace(/^\/api-proxy/, '') || '/'
  // Mandate: documented /ws/v12/... → /ws/v20/... (leave v19 OAuth paths alone)
  proxyPath = proxyPath.replace(/\/ws\/v12(\/|$)/g, '/ws/v20$1')
  const contextRoot = (env.VITE_CONTEXT_ROOT || 'system').replace(/^\/+|\/+$/g, '')
  if (proxyPath.startsWith('/ws/')) {
    proxyPath = `/${contextRoot}${proxyPath}`
  }
  const targetUrl = new URL(proxyPath + incoming.search, origin)

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue
    const lower = key.toLowerCase()
    if (
      lower === 'host' ||
      lower === 'origin' ||
      lower === 'referer' ||
      lower === 'connection' ||
      lower === 'content-length' ||
      lower === 'x-target-server'
    ) {
      continue
    }
    headers.set(key, Array.isArray(value) ? value.join(',') : value)
  }
  headers.set('Host', origin.host)

  const method = req.method ?? 'GET'
  let body: Buffer | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    body = await readBody(req)
  }

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body: body && body.length > 0 ? new Uint8Array(body) : undefined,
  })

  res.statusCode = upstream.status

  // Node fetch decompresses the body automatically. Never forward upstream
  // content-encoding / content-length — those refer to the compressed payload
  // and will truncate large JSON (e.g. GET user?$attribute=all) in the browser.
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (
      lower === 'transfer-encoding' ||
      lower === 'content-encoding' ||
      lower === 'content-length' ||
      lower === 'connection'
    ) {
      return
    }
    res.setHeader(key, value)
  })

  // Expose session header to the browser
  const session = upstream.headers.get('x-egain-session')
  if (session) {
    res.setHeader('Access-Control-Expose-Headers', 'X-egain-session, x-egain-session')
    res.setHeader('X-egain-session', session)
  }

  const buf = Buffer.from(await upstream.arrayBuffer())
  res.setHeader('Content-Length', String(buf.length))
  res.end(buf)
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default defineConfig({
  plugins: [react(), egainProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    open: false,
  },
})
