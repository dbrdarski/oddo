#!/usr/bin/env node
/**
 * Oddo Demo Build Script
 * Compiles .oddo source files to JavaScript and bundles with @oddo/ui
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as esbuild from 'esbuild'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SRC_DIR = path.join(__dirname, 'src')
const PUBLIC_DIR = path.join(__dirname, 'public')
const DIST_DIR = path.join(__dirname, 'dist')
const TEMP_DIR = path.join(__dirname, '.temp')
const UI_PACKAGE = path.join(__dirname, '..', 'ui', 'src', 'index.mjs')
const LANG_PACKAGE = path.join(__dirname, '..', 'lang', 'src', 'index.mjs')

// Import compiler
const langPath = path.join(__dirname, '..', 'lang', 'src', 'index.mjs')
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

function copyFile(src, dest) {
  ensureDir(path.dirname(dest))
  fs.copyFileSync(src, dest)
  console.log(`📄 Copied: ${path.relative(__dirname, dest)}`)
}

function processPublicDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name)

    if (entry.isDirectory()) {
      processPublicDir(srcPath, path.join(destDir, entry.name))
    } else if (entry.isFile()) {
      copyFile(srcPath, path.join(destDir, entry.name))
    }
  }
}

async function compileOddo(srcPath, relativePath) {
  const tempJsPath = path.join(TEMP_DIR, relativePath.replace('.oddo', '.js'))

  try {
    // Compile Oddo to JS
    const source = fs.readFileSync(srcPath, 'utf-8')
    const jsCode = compileOddoToJS(source, { runtimeLibrary: '@oddo/ui' })

    // Ensure temp subdirectories exist
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

async function bundleJs(tempJsPath, destPath, relativePath) {
  try {
    // Ensure dist subdirectories exist
    ensureDir(path.dirname(destPath))

    // Bundle with esbuild (resolving @oddo/ui)
    const result = await esbuild.build({
      entryPoints: [tempJsPath],
      bundle: true,
      treeShaking: true,
      format: 'iife',
      outfile: destPath,
      platform: 'browser',
      target: ['es2020'],
      alias: {
        '@oddo/ui': UI_PACKAGE,
        '@oddo/lang': LANG_PACKAGE
      },
      logLevel: 'silent'
    })

    const stats = fs.statSync(destPath)
    console.log(`📦 Bundled: ${relativePath.replace('.oddo', '.js')} (${(stats.size / 1024).toFixed(1)}KB)`)
    return true
  } catch (err) {
    console.error(`❌ Bundle Error: ${relativePath}`)
    console.error(`   ${err.message}`)
    return false
  }
}

async function build() {
  console.log('\n🔨 Building Oddo Playground...\n')

  // Clean dist
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true })
  }
  ensureDir(DIST_DIR)

  // Clean temp
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true })
  }

  // Copy public assets
  processPublicDir(PUBLIC_DIR, DIST_DIR)

  // Phase 1: Compile all .oddo files to .js
  const entryPoints = []
  if (fs.existsSync(SRC_DIR)) {
    console.log('\nPhase 1: Compiling .oddo files...')
    for (const entry of fs.readdirSync(SRC_DIR, { withFileTypes: true, recursive: true })) {
      if (entry.isFile() && entry.name.endsWith('.oddo')) {
        const fullSrcPath = path.join(entry.path, entry.name)
        const relativePath = path.relative(SRC_DIR, fullSrcPath)
        const tempJsPath = await compileOddo(fullSrcPath, relativePath)
        
        if (tempJsPath) {
          // Only bundle entry points (top-level files, not in subdirectories)
          if (!relativePath.includes(path.sep) || relativePath.startsWith('app.')) {
            entryPoints.push({ tempJsPath, relativePath })
          }
        }
      }
    }

    // Phase 2: Bundle entry points
    console.log('\nPhase 2: Bundling entry points...')
    for (const { tempJsPath, relativePath } of entryPoints) {
      const destPath = path.join(DIST_DIR, relativePath.replace('.oddo', '.js'))
      await bundleJs(tempJsPath, destPath, relativePath)
    }
  }

  // Clean up temp
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true })
  }

  console.log('\n✅ Build complete!\n')
}

async function main() {
  await loadCompiler()
  await build()

  if (process.argv.includes('--watch') || process.argv.includes('-w')) {
    console.log('👀 Watching for changes...\n')

    const watchDir = (dir, isPublic) => {
      if (!fs.existsSync(dir)) return
      fs.watch(dir, { recursive: true }, async (_, filename) => {
        if (!filename) return
        const srcPath = path.join(dir, filename)
        if (!fs.existsSync(srcPath)) return

        console.log(`\n📝 Changed: ${filename}`)
        if (isPublic) {
          copyFile(srcPath, path.join(DIST_DIR, filename))
        } else if (filename.endsWith('.oddo')) {
          const relativePath = path.relative(SRC_DIR, srcPath)
          const tempJsPath = await compileOddo(srcPath, relativePath)
          
          if (tempJsPath) {
            // Only bundle if it's an entry point
            if (!relativePath.includes(path.sep) || relativePath.startsWith('app.')) {
              const destPath = path.join(DIST_DIR, relativePath.replace('.oddo', '.js'))
              await bundleJs(tempJsPath, destPath, relativePath)
            }
          }
        }
      })
    }

    watchDir(SRC_DIR, false)
    watchDir(PUBLIC_DIR, true)
  }
}

main().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
