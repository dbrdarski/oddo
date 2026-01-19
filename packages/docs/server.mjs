#!/usr/bin/env node
/**
 * Oddo Playground Server
 *
 * Serves the playground and handles compilation requests.
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as esbuild from 'esbuild'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3032
const DIST_DIR = path.join(__dirname, 'dist')
const PACKAGES_DIR = path.join(__dirname, '..')
const UI_PACKAGE = path.join(PACKAGES_DIR, 'ui', 'src', 'index.mjs')

// Import compiler
const langPath = path.join(PACKAGES_DIR, 'lang', 'src', 'index.mjs')
let parseOddo, compileOddoToJS

async function loadCompiler() {
  const lang = await import(langPath)
  parseOddo = lang.parseOddo
  compileOddoToJS = lang.compileOddoToJS
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.oddo': 'text/plain',
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  console.log(`${req.method} ${url.pathname}`)

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // Compile endpoint
  if (url.pathname === '/compile' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk.toString() })
    req.on('end', () => {
      try {
        const { code } = JSON.parse(body)

        // Parse to AST
        const ast = parseOddo(code)

        // Compile to JS
        const js = compileOddoToJS(code, { runtimeLibrary: '@oddo/ui' })

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ast, js }))
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // Preview endpoint - compiles and bundles user code
  if (url.pathname === '/preview' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk.toString() })
    req.on('end', async () => {
      try {
        const { js } = JSON.parse(body)

        // Bundle the compiled JS with esbuild (resolving @oddo/ui)
        const result = await esbuild.build({
          stdin: {
            contents: js,
            loader: 'js',
            resolveDir: __dirname
          },
          bundle: true,
          treeShaking: true,
          format: 'iife',
          platform: 'browser',
          target: ['es2020'],
          write: false,
          alias: {
            '@oddo/ui': UI_PACKAGE
          },
          logLevel: 'silent'
        })

        const bundledCode = result.outputFiles[0].text

        // Build preview HTML
        const html = `<!DOCTYPE html>
<html><head><style>body{margin:0;font-family:system-ui,sans-serif;}</style></head>
<body>
<script>
try {
${bundledCode}
} catch(e) {
  document.body.innerHTML='<pre style="color:red;padding:20px;">Error: '+e.message+'</pre>';
}
</script>
</body></html>`

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(html)
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`<pre style="color:red;padding:20px;">Bundle Error: ${err.message}</pre>`)
      }
    })
    return
  }

  // Static file serving
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname

  // Handle package requests
  if (filePath.startsWith('/packages/')) {
    const fullPath = path.join(PACKAGES_DIR, filePath.replace('/packages/', ''))
    return serveFile(res, fullPath)
  }

  // Serve from dist dir
  const fullPath = path.join(DIST_DIR, filePath)
  serveFile(res, fullPath, true)
})

function serveFile(res, filePath, spaFallback = false) {
  const extname = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[extname] || 'application/octet-stream'

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // For SPA routes (no extension or html), serve index.html
        if (spaFallback && (!extname || extname === '.html')) {
          const indexPath = path.join(DIST_DIR, 'index.html')
          fs.readFile(indexPath, (indexErr, indexContent) => {
            if (indexErr) {
              res.writeHead(500, { 'Content-Type': 'text/plain' })
              res.end('Server Error')
              return
            }
            res.writeHead(200, {
              'Content-Type': 'text/html',
              'Cache-Control': 'no-cache'
            })
            res.end(indexContent)
          })
          return
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Server Error')
      }
      return
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    })
    res.end(content)
  })
}

async function start() {
  await loadCompiler()

  server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║                                                  ║
║   ⚡ Oddo Playground                             ║
║                                                  ║
║   http://localhost:${PORT}                          ║
║                                                  ║
║   Ctrl+C to stop                                 ║
║                                                  ║
╚══════════════════════════════════════════════════╝
    `)
  })
}

start().catch(err => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
