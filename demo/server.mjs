#!/usr/bin/env node
/**
 * Oddo Demo Development Server
 * 
 * Serves the compiled demo files with live reload support.
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3030
const DIST_DIR = path.join(__dirname, 'dist')
const PACKAGES_DIR = path.join(__dirname, '..', 'packages')

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/**
 * Resolve import paths for ES modules
 * Maps bare imports like '@oddo/ui' to actual file paths
 */
function resolveImport(filePath, content) {
  // Only process JS files
  if (!filePath.endsWith('.js') && !filePath.endsWith('.mjs')) {
    return content
  }

  // Replace @oddo/ui imports with relative path to packages
  return content.replace(
    /from\s+["']@oddo\/ui["']/g,
    `from "/packages/ui/dist/index.mjs"`
  )
}

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`)

  // Parse URL
  let urlPath = req.url.split('?')[0]
  
  // Default to index.html for root
  if (urlPath === '/') {
    urlPath = '/index.html'
  }

  let fullPath
  let isPackageRequest = false

  // Handle package requests (for @oddo/ui imports)
  if (urlPath.startsWith('/packages/')) {
    fullPath = path.join(PACKAGES_DIR, urlPath.replace('/packages/', ''))
    isPackageRequest = true
  } else {
    fullPath = path.join(DIST_DIR, urlPath)
  }

  // Security: prevent directory traversal
  const normalizedPath = path.normalize(fullPath)
  const allowedPaths = [DIST_DIR, PACKAGES_DIR]
  
  if (!allowedPaths.some(p => normalizedPath.startsWith(p))) {
    res.writeHead(403, { 'Content-Type': 'text/html' })
    res.end('<h1>403 Forbidden</h1>', 'utf-8')
    return
  }

  // Get file extension
  const extname = String(path.extname(fullPath)).toLowerCase()
  const contentType = MIME_TYPES[extname] || 'application/octet-stream'

  fs.readFile(fullPath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // Try with .js extension for extensionless imports
        if (!extname) {
          fs.readFile(fullPath + '.js', (err, jsContent) => {
            if (err) {
              res.writeHead(404, { 'Content-Type': 'text/html' })
              res.end(`<h1>404 Not Found</h1><p>${req.url}</p>`, 'utf-8')
            } else {
              res.writeHead(200, { 
                'Content-Type': 'application/javascript',
                'Cache-Control': 'no-cache'
              })
              const processed = resolveImport(fullPath + '.js', jsContent.toString())
              res.end(processed, 'utf-8')
            }
          })
          return
        }
        
        res.writeHead(404, { 'Content-Type': 'text/html' })
        res.end(`<h1>404 Not Found</h1><p>${req.url}</p>`, 'utf-8')
      } else {
        res.writeHead(500)
        res.end(`Server Error: ${error.code}`, 'utf-8')
      }
    } else {
      // Process JS files to resolve imports
      let processedContent = content
      if (contentType === 'application/javascript') {
        processedContent = resolveImport(fullPath, content.toString())
      }

      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      })
      res.end(processedContent, 'utf-8')
    }
  })
})

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║                                              ║
║   🚀 Oddo Demo Server Running!               ║
║                                              ║
║   Local:   http://localhost:${PORT}             ║
║                                              ║
║   Press Ctrl+C to stop                       ║
║                                              ║
╚══════════════════════════════════════════════╝
  `)
})

