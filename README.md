# Agentic World Representation

Project page for **Agentic World Representation (AWR)**: structured object geometry for grasp optimization, demonstrations, and robot policy learning.

**Live site:** https://maureenzou.github.io/agenticWR/

## GitHub Pages

This repository is a complete static website. GitHub Pages publishes `main` from the repository root. `.nojekyll` tells Pages to serve the files directly; no Jekyll processing, package installation, backend, or build is needed.

Keep `index.html`, `styles.css`, `app.js`, and `assets/` together. Asset URLs, ES module imports, and JSON requests are relative, so the page works under `/agenticWR/` as well as on a local server. The canonical and Open Graph URLs point to the live project page.

Push changes to `main`, then check the **pages build and deployment** run in Actions and open the live URL. A successful Git push alone does not establish that deployment has completed.

## Local preview

```sh
npm run dev
```

Open http://127.0.0.1:4173/. Node.js is only needed for this local preview and the checks below. `PORT` and `PROJECT_HOST` override the default address. `npm install` is not required.

```sh
npm run check
npm run check:geometry
```

## Included materials

- HTML, CSS, and all interactive scene code.
- 27 animated reconstruction examples and their posters: 10 articulated, 7 skinned, and 10 soft objects.
- Recorded real-robot GIF excerpts, observation and method figures, the annotated setup image, and result-table JSON.
- Locally hosted Outfit fonts and Three.js/OrbitControls, with their original licenses.

All runtime materials are committed directly to Git, with no Git LFS, CDN, remote model service, or parent-directory dependency. The browser renders the procedural geometry and hand animations locally. The original video is displayed as bundled GIF excerpts.

The reading order is Overview → Representation → Object Zoo → Action → Real robot → Results. Observation, architecture, full-gallery, and setup details expand in place; method results use tabs. The RGB-D figure retains its original aspect ratio on desktop and mobile.

## Source and interpretation

The initial page is imported from `IEILab/corl_worldstring` commit `df788f9` (2026-10-27), including the unified AWR text and the corrected RGB-D layout. That maintenance repository retains the original figure PDFs, LaTeX table sources, original video, archived media, and internal provenance records. They are not needed to serve this page and are not copied into this publishing repository.

WorldString remains the attributed prior work and baseline. The notation ∂Oθ refers to the action-differentiable object representation; table labels display AWR without changing the reported values.

The interactive geometry and five-finger hand are teaching illustrations. The optimizer updates 14 joints through a small geometric loss; demonstration and policy-learning animations are schematic. The real-robot GIFs are excerpts of recorded execution, shown at 2× the supplied video timeline, rather than new hardware evaluations. The tabulated results are the supplied research results.

## Deployment checks

Before publishing, check JavaScript syntax, relative HTML/CSS/module/JSON asset references, and a local preview served under `/agenticWR/`. After publishing, verify the live HTML and bundled assets, the interactive representation and action tabs, the gallery, result tables, and a narrow viewport. Review screenshots and temporary reports belong in ignored `.preview/`.
