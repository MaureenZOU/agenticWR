# Agentic World Representation
Project website: https://maureenzou.github.io/agenticWR/

The repository root contains `index.html`, `README.md`, `assets/`, and `.gitignore`.
The website keeps its existing URLs and uses the existing GitHub Pages branch deployment.

- `assets/pages/`: other HTML pages and compatibility redirects. Each page declares its original published path with Jekyll front matter.
- `assets/entry/`: the original `app.js` and `styles.css`, published at their original root URLs.
- `assets/_dev/`: local preview server, validation/generation scripts, and developer documentation. Jekyll excludes this directory from the published site.
- Other `assets/` files: unchanged website media, geometry, and runtime modules.

Run commands from the repository root:

```sh
npm --prefix assets run dev
npm --prefix assets run check
npm --prefix assets run check:objects
npm --prefix assets run check:geometry
```

The preview server serves the same paths and strips only the publishing metadata from relocated pages. It retains video byte-range support. To preview an actual Pages build, set `PROJECT_SITE_DIR` to that build directory; `PROJECT_BASE_PATH=/agenticWR` also reproduces the hosted project prefix.

Before publishing layout changes, build with the official GitHub Pages Jekyll builder and compare its output against the last approved website:

```sh
npm --prefix assets run check:published -- /path/to/built/site d3f33e4
```

This compares every existing public page and asset directly, byte for byte. See [publishing and validation notes](assets/_dev/docs/repository-layout.md) for the reproducible build command and URL contract.
