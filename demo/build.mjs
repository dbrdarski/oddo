#!/usr/bin/env node
/**
 * Oddo Demo Build Script
 * 
 * Compiles .oddo source files to JavaScript and copies static assets.
 * Supports watch mode for development.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Paths
const SRC_DIR = path.join(__dirname, 'src')
const PUBLIC_DIR = path.join(__dirname, 'public')
const DIST_DIR = path.join(__dirname, 'dist')

// Import compiler from lang package (using source directly for dev)
const langPath = path.join(__dirname, '..', 'packages', 'lang', 'src', 'index.mjs')

let compileOddoToJS

async function loadCompiler() {
  const lang = await import(langPath)
  compileOddoToJS = lang.compileOddoToJS
}

/**
 * Ensure directory exists
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Copy a file from src to dest
 */
function copyFile(src, dest) {
  ensureDir(path.dirname(dest))
  fs.copyFileSync(src, dest)
  console.log(`📄 Copied: ${path.relative(__dirname, src)} → ${path.relative(__dirname, dest)}`)
}

/**
 * Compile an .oddo file to JavaScript
 */
function compileFile(srcPath, destPath) {
  try {
    const source = fs.readFileSync(srcPath, 'utf-8')
    const jsCode = compileOddoToJS(source, {
      runtimeLibrary: '@oddo/ui'
    })
    
    ensureDir(path.dirname(destPath))
    fs.writeFileSync(destPath, jsCode, 'utf-8')
    console.log(`✨ Compiled: ${path.relative(__dirname, srcPath)} → ${path.relative(__dirname, destPath)}`)
    return true
  } catch (err) {
    console.error(`❌ Error compiling ${path.relative(__dirname, srcPath)}:`)
    console.error(`   ${err.message}`)
    return false
  }
}

/**
 * Process all files in a directory
 */
function processDirectory(srcDir, destDir, isPublic = false) {
  if (!fs.existsSync(srcDir)) {
    return
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
  
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    
    if (entry.isDirectory()) {
      // Recursively process subdirectories
      processDirectory(srcPath, path.join(destDir, entry.name), isPublic)
    } else if (entry.isFile()) {
      if (isPublic) {
        // Copy public files as-is
        const destPath = path.join(destDir, entry.name)
        copyFile(srcPath, destPath)
      } else {
        // Compile .oddo files, copy others
        if (entry.name.endsWith('.oddo')) {
          const destPath = path.join(destDir, entry.name.replace('.oddo', '.js'))
          compileFile(srcPath, destPath)
        } else {
          const destPath = path.join(destDir, entry.name)
          copyFile(srcPath, destPath)
        }
      }
    }
  }
}

/**
 * Clean the dist directory
 */
function clean() {
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true })
    console.log('🧹 Cleaned dist directory')
  }
}

/**
 * Full build
 */
function build() {
  console.log('\n🔨 Building Oddo Demo...\n')
  
  // Clean
  clean()
  ensureDir(DIST_DIR)
  
  // Copy public files
  processDirectory(PUBLIC_DIR, DIST_DIR, true)
  
  // Compile source files
  processDirectory(SRC_DIR, DIST_DIR, false)
  
  console.log('\n✅ Build complete!\n')
}

/**
 * Watch mode - rebuild on file changes
 */
function watch() {
  console.log('\n👀 Watching for changes...\n')
  
  // Initial build
  build()
  
  // Watch src directory
  if (fs.existsSync(SRC_DIR)) {
    fs.watch(SRC_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      
      const srcPath = path.join(SRC_DIR, filename)
      
      // Skip if file doesn't exist (deleted)
      if (!fs.existsSync(srcPath)) return
      
      console.log(`\n📝 Changed: ${filename}`)
      
      if (filename.endsWith('.oddo')) {
        const destPath = path.join(DIST_DIR, filename.replace('.oddo', '.js'))
        compileFile(srcPath, destPath)
      } else {
        const destPath = path.join(DIST_DIR, filename)
        copyFile(srcPath, destPath)
      }
    })
  }
  
  // Watch public directory
  if (fs.existsSync(PUBLIC_DIR)) {
    fs.watch(PUBLIC_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      
      const srcPath = path.join(PUBLIC_DIR, filename)
      
      // Skip if file doesn't exist (deleted)
      if (!fs.existsSync(srcPath)) return
      
      console.log(`\n📝 Changed: ${filename}`)
      
      const destPath = path.join(DIST_DIR, filename)
      copyFile(srcPath, destPath)
    })
  }
}

// Main
async function main() {
  await loadCompiler()
  
  const args = process.argv.slice(2)
  
  if (args.includes('--watch') || args.includes('-w')) {
    watch()
  } else {
    build()
  }
}

main().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})

