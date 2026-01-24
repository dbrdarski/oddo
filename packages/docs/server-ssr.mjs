#!/usr/bin/env node
/**
 * Oddo SSR Server
 *
 * Pre-compiles app.oddo to an SSR bundle, then serves the rendered HTML.
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as esbuild from 'esbuild'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3033
const SRC_DIR = path.join(__dirname, 'src')
const PUBLIC_DIR = path.join(__dirname, 'public')
const DIST_SSR_DIR = path.join(__dirname, 'dist-ssr')
const TEMP_DIR = path.join(__dirname, '.temp-ssr')
const PACKAGES_DIR = path.join(__dirname, '..')

// SSR package paths
const UI_SSR_PACKAGE = path.join(PACKAGES_DIR, 'ui', 'src', 'index-ssr.mjs')
const ROUTER_SRC = path.join(PACKAGES_DIR, 'router', 'src', 'index.mjs')
const LANG_PACKAGE = path.join(PACKAGES_DIR, 'lang', 'src', 'index.mjs')

// Import compiler
const langPath = path.join(PACKAGES_DIR, 'lang', 'src', 'index.mjs')
let compileOddoToJS

async function loadCompiler() {
  const lang = await import(langPath)
  compileOddoToJS = lang.compileOddoToJS
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  ensureDir(dir)
}

async function compileOddo(srcPath, relativePath) {
  const tempJsPath = path.join(TEMP_DIR, relativePath.replace('.oddo', '.js'))

  try {
    const source = fs.readFileSync(srcPath, 'utf-8')
    const jsCode = compileOddoToJS(source, { runtimeLibrary: '@oddo/ui' })

    ensureDir(path.dirname(tempJsPath))
    fs.writeFileSync(tempJsPath, jsCode, 'utf-8')

    console.log(`📝 Compiled: ${relativePath}`)
    return tempJsPath
  } catch (err) {
    console.error(`❌ Compile Error: ${relativePath}`)
    console.error(`   ${err.message}`)
    return null
  }
}

async function buildSSR() {
  console.log('\n🔨 Building SSR bundle...\n')

  cleanDir(DIST_SSR_DIR)
  cleanDir(TEMP_DIR)

  // Phase 1: Compile all .oddo files to .js
  console.log('Phase 1: Compiling .oddo files...')

  if (!fs.existsSync(SRC_DIR)) {
    throw new Error('src directory not found')
  }

  for (const entry of fs.readdirSync(SRC_DIR, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.oddo')) {
      const fullSrcPath = path.join(entry.path, entry.name)
      const relativePath = path.relative(SRC_DIR, fullSrcPath)
      await compileOddo(fullSrcPath, relativePath)
    }
  }

  // Phase 2: Bundle server.js with SSR aliases
  console.log('\nPhase 2: Bundling with SSR aliases...')

  const serverTempPath = path.join(TEMP_DIR, 'server.js')
  const bundlePath = path.join(DIST_SSR_DIR, 'ssr-bundle.mjs')

  if (!fs.existsSync(serverTempPath)) {
    throw new Error('server.js not found in temp directory')
  }

  await esbuild.build({
    entryPoints: [serverTempPath],
    bundle: true,
    treeShaking: true,
    format: 'esm',
    outfile: bundlePath,
    platform: 'node',
    target: ['node18'],
    alias: {
      '@oddo/ui': UI_SSR_PACKAGE,
      '@oddo/router': ROUTER_SRC,
      '@oddo/lang': LANG_PACKAGE
    },
    logLevel: 'silent'
  })

  const stats = fs.statSync(bundlePath)
  console.log(`📦 Bundled: ssr-bundle.mjs (${(stats.size / 1024).toFixed(1)}KB)`)

  // Clean up temp
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true })
  }

  console.log('\n✅ SSR build complete!\n')
  return bundlePath
}

// Load the SSR bundle and return the render function
async function loadSSRBundle(bundlePath) {
  console.log('📦 Loading SSR bundle...')
  
  const { default: renderApp } = await import(bundlePath + `?t=${Date.now()}`)
  
  console.log('✅ SSR bundle loaded')
  return renderApp
}

// Render a specific path
function renderPath(renderApp, pathname) {
  const html = renderApp(pathname)
  return html
}

function injectIntoTemplate(appHtml) {
  const templatePath = path.join(PUBLIC_DIR, 'index.html')
  const template = fs.readFileSync(templatePath, 'utf-8')

  // Replace the empty #app div with the rendered content
  const html = template.replace(
    '<div id="app"></div>',
    `<div id="app">${appHtml}</div>`
  )

  // Remove the client-side script for pure SSR
  return html.replace(
    '<script src="./app.js"></script>',
    '<!-- SSR rendered - no client JS -->'
  )
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

function serveFile(res, filePath) {
  const extname = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[extname] || 'application/octet-stream'

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
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

  // Build the SSR bundle
  const bundlePath = await buildSSR()

  // Load the render function from the bundle
  const renderApp = await loadSSRBundle(bundlePath)

  // Start server
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    console.log(`${req.method} ${url.pathname}`)

    // Serve static files (files with extensions)
    if (url.pathname.includes('.')) {
      const filePath = path.join(PUBLIC_DIR, url.pathname)
      serveFile(res, filePath)
      return
    }

    // SSR render the requested route
    try {
      const appHtml = renderPath(renderApp, url.pathname)
      const fullHtml = injectIntoTemplate(appHtml)
      
      console.log(`  ✅ SSR: ${url.pathname} (${appHtml.length} chars)`)
      
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache'
      })
      res.end(fullHtml)
    } catch (err) {
      console.error(`  ❌ SSR Error: ${err.message}`)
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Server Error')
    }
  })

  server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║                                                  ║
║   🖥️  Oddo SSR Server (Multi-Route)               ║
║                                                  ║
║   http://localhost:${PORT}                          ║
║                                                  ║
║   Routes:                                        ║
║     /           -> GuidePage                     ║
║     /api        -> APIPage                       ║
║     /playground -> Playground                   ║
║                                                  ║
║   Ctrl+C to stop                                 ║
║                                                  ║
╚══════════════════════════════════════════════════╝
    `)
  })
}

start().catch(err => {
  console.error('Failed to start SSR server:', err)
  process.exit(1)
})
