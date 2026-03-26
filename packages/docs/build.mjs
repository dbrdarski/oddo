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
const CACHE_DIR = path.join(__dirname, '.cache')
const UI_PACKAGE = path.join(__dirname, '..', 'ui', 'src', 'index.mjs')
const LANG_PACKAGE = path.join(__dirname, '..', 'lang', 'src', 'index.mjs')
const ROUTER_PACKAGE = path.join(__dirname, '..', 'router', 'src', 'index.mjs')

import { createBuildContext } from '../build/src/index.mjs'

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

function writeTempJs(filePath, jsCode) {
  const relativePath = path.relative(SRC_DIR, filePath)
  const tempJsPath = path.join(TEMP_DIR, relativePath.replace('.oddo', '.js'))
  ensureDir(path.dirname(tempJsPath))
  fs.writeFileSync(tempJsPath, jsCode, 'utf-8')
  console.log(`📝 Compiled: ${relativePath}`)
  return tempJsPath
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
        '@oddo/lang': LANG_PACKAGE,
        '@oddo/router': ROUTER_PACKAGE
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

  // Phase 1: Compile all .oddo files using the build pipeline (DAG-aware, signature-propagating)
  const entryPoints = []
  if (fs.existsSync(SRC_DIR)) {
    console.log('\nPhase 1: Compiling .oddo files...')
    const ctx = createBuildContext({ srcDir: SRC_DIR, cacheDir: CACHE_DIR, runtimeLibrary: '@oddo/ui' })
    const { results } = await ctx.build()

    for (const [filePath, { js }] of results) {
      const tempJsPath = writeTempJs(filePath, js)
      const relativePath = path.relative(SRC_DIR, filePath)
      if (relativePath === 'client.oddo') {
        entryPoints.push({ tempJsPath, relativePath: 'app.oddo' })
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
  await build()

  if (process.argv.includes('--watch') || process.argv.includes('-w')) {
    console.log('👀 Watching for changes...\n')

    const ctx = createBuildContext({ srcDir: SRC_DIR, cacheDir: CACHE_DIR, runtimeLibrary: '@oddo/ui' })
    await ctx.build()

    const watcher = ctx.createWatcher({
      onChange: async ({ results }) => {
        for (const [filePath, { js }] of results) {
          const tempJsPath = writeTempJs(filePath, js)
          const relativePath = path.relative(SRC_DIR, filePath)
          if (relativePath === 'client.oddo') {
            const destPath = path.join(DIST_DIR, 'app.js')
            await bundleJs(tempJsPath, destPath, 'app.oddo')
          }
        }
      }
    })

    if (fs.existsSync(PUBLIC_DIR)) {
      fs.watch(PUBLIC_DIR, { recursive: true }, (_, filename) => {
        if (!filename) return
        const srcPath = path.join(PUBLIC_DIR, filename)
        if (!fs.existsSync(srcPath)) return
        console.log(`\n📝 Changed: ${filename}`)
        copyFile(srcPath, path.join(DIST_DIR, filename))
      })
    }
  }
}

main().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
