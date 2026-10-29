# Repository layout and published URLs

The four tracked root entries are `.gitignore`, `README.md`, `assets/`, and `index.html`. The root `.git/` metadata and ignored local `.preview/` output are not repository entries on GitHub.

GitHub Pages continues publishing the same branch and source directory. Removing `.nojekyll` enables its built-in Jekyll build. No Settings changes, custom workflows, symlinks, theme templates, or custom plugins are needed.

The six HTML files in `assets/pages/` declare their original root `.html` paths. The two files in `assets/entry/` declare `/app.js` and `/styles.css`. Their YAML front matter has `layout: null`; everything after it is the previously approved source. `index.html` and the original 390 files under `assets/` are unchanged. The result retains all 399 existing website page/resource paths, including the four legacy redirects and all native grasp/pose data.

Developer documents and tools live under `assets/_dev/`, which Jekyll excludes by its default underscore-directory rule. Their GitHub repository paths and local commands have changed; they are not part of the website's page/resource contract. `assets/package.json` supplies ESM context and local npm commands.

## Reproduce the actual Pages build

From the repository root, with Docker running:

```sh
mkdir -p .preview/pages-build
docker run --rm --platform linux/amd64 --entrypoint /bin/sh \
  -v "$PWD:/source:ro" -v "$PWD/.preview/pages-build:/output" \
  -e JEKYLL_ENV=production -e PAGES_REPO_NWO=MaureenZOU/agenticWR \
  -e PAGES_API_URL=https://api.github.com \
  ghcr.io/actions/jekyll-build-pages:v1.0.13 \
  -c 'unset JEKYLL_GITHUB_TOKEN GITHUB_TOKEN; cd /source; /usr/local/bundle/bin/github-pages build --source /source --destination /output'
npm --prefix assets run check:published -- "$PWD/.preview/pages-build" d3f33e4
```

The local command calls the same `github-pages` executable as the image entrypoint, using anonymous public repository metadata instead of an empty CI token. The hosted build receives GitHub’s own token. Neither changes the byte comparison of website files.

`check:published` compares the real build's pages, scripts, styles, media, binary geometry, and JSON with the approved Git revision using direct byte comparisons. It also checks that the source-aware preview produces the same bytes. It does not generate checksums.

For an isolated preview of the actual build:

```sh
PROJECT_SITE_DIR="$PWD/.preview/pages-build" PROJECT_BASE_PATH=/agenticWR PORT=4176 npm --prefix assets run dev
```

Validate the project-prefix routes, Results tabs and deep links, legacy redirects, gallery loading, constrained object controls, grasp replay, and video byte ranges before push. After deployment, verify the live root routes and resource availability against the same build.
