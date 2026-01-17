# @oddo/docs

Documentation and examples for the Oddo framework.

## Installation

```bash
npm install @oddo/docs
```

## What's Included

This package contains:

- **Documentation pages** - Guide and API reference written in Oddo
- **Example code** - Playground examples demonstrating Oddo features
- **Build tools** - Scripts to compile and serve the documentation

## Usage

### Building the Documentation

```bash
npm run build
```

This compiles all `.oddo` files in `src/` to JavaScript and outputs to `dist/`.

### Serving Locally

```bash
npm run serve
```

Starts a local server to view the documentation.

### Development Mode

```bash
npm run dev
```

Builds and serves with file watching.

## Structure

```
docs/
├── src/
│   ├── app.oddo          # Main application
│   └── pages/
│       ├── guide/        # Getting started guide
│       ├── api/          # API reference
│       └── playground/   # Interactive examples
├── public/
│   └── index.html        # HTML template
├── build.mjs             # Build script
└── server.mjs            # Development server
```

## License

MIT

