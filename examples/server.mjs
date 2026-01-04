import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 3000

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
  '.ico': 'image/x-icon'
}

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`)

  // Default to index.html for root
  let filePath = req.url === '/' ? '/index.html' : req.url

  // Resolve to examples directory or parent for node_modules
  const projectRoot = path.join(__dirname, '..')
  let fullPath = path.join(__dirname, filePath)

  // If file doesn't exist in examples, try project root (for packages/*)
  if (!fs.existsSync(fullPath) && filePath.startsWith('/packages')) {
    fullPath = path.join(projectRoot, filePath)
  }

  // Get file extension
  const extname = String(path.extname(fullPath)).toLowerCase()
  const contentType = MIME_TYPES[extname] || 'application/octet-stream'

  fs.readFile(fullPath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' })
        res.end('<h1>404 Not Found</h1>', 'utf-8')
      } else {
        res.writeHead(500)
        res.end(`Server Error: ${error.code}`, 'utf-8')
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(content, 'utf-8')
    }
  })
})

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║                                            ║
║   @oddo/ui Playground Server Running!      ║
║                                            ║
║   URL: http://localhost:${PORT}              ║
║                                            ║
║   Press Ctrl+C to stop                     ║
║                                            ║
╚════════════════════════════════════════════╝
  `)
})
