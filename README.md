# Oddo Monorepo

A modern npm workspaces monorepo containing `@oddo/ui` and `@oddo/lang` packages with full tree-shaking support.

## Structure

```
oddo/
├── package.json          # Root workspace configuration
├── packages/
│   ├── ui/              # @oddo/ui - UI Framework
│   │   ├── src/
│   │   │   └── index.mjs
│   │   ├── package.json
│   │   └── tsup.config.js
│   └── lang/            # @oddo/lang - Language Package
│       ├── src/
│       │   └── index.mjs
│       ├── package.json
│       └── tsup.config.js
└── .gitignore
```

## Getting Started

### 1. Add Your Code

Copy your code into the respective packages:

- **UI Framework**: `packages/ui/src/`
- **Language Package**: `packages/lang/src/`

Make sure to export everything from `index.mjs` in each package:

```javascript
// packages/ui/src/index.mjs
export { Component1 } from './component1.mjs';
export { Component2 } from './component2.mjs';
// ... etc
```

### 2. Build Packages

```bash
# Build all packages
npm run build

# Build specific package
npm run build:ui
npm run build:lang
```

### 3. Using the Packages

In another project, you can import from your packages:

```javascript
import { Button } from '@oddo/ui';
import { parse } from '@oddo/lang';
```

## Tree Shaking

This monorepo is configured for optimal tree shaking:

- ✅ **ESM modules** (.mjs) for static analysis
- ✅ **`"sideEffects": false`** in package.json
- ✅ **Modern `exports` field** for proper resolution
- ✅ **tsup code splitting** for granular imports

Only imported functions will be included in consumer bundles.

## Development

### Adding New Exports

Simply export from your package's `index.mjs`:

```javascript
// packages/ui/src/index.mjs
export { MyNewComponent } from './my-new-component.mjs';
```

Then rebuild:

```bash
npm run build:ui
```

### Package Structure

Each package outputs:
- `dist/index.mjs` - ESM format (modern)
- `dist/index.js` - CommonJS format (legacy compatibility)
- Source maps for debugging

## Publishing

When ready to publish:

1. Update version in package.json
2. Build the packages: `npm run build`
3. Publish from package directory:
   ```bash
   cd packages/ui
   npm publish --access public
   ```

## Notes

- All packages use native ESM (`.mjs` files)
- tsup handles bundling and optimization
- Source maps are generated for debugging
- Both ESM and CJS outputs are created for compatibility

