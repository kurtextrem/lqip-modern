# Blur Benchmarks (Tachometer)

This folder contains two Tachometer benchmarks with the same variant matrix:

- Techniques:
  - `backdrop-filter`
  - `filter`
  - `nextjs-blur`
  - `svg-blur`
  - `svg-blur-css`
- Blur radii: `10`, `20`, `40`
- `content-visibility`: `off`, `auto`

Total benchmark variants per suite: `5 * 3 * 2 = 30`.

## Benchmarks

- `reflow-paint-benchmark.html`: reflow/layout/paint/commit pressure scenario.
- `animation-benchmark.html`: placeholder opacity animation (`1 -> 0`) and FPS collection.

## Manual preview (DevTools profiling)

Start the server and open any benchmark variant in your browser:

```bash
pnpm bench:preview
```

This prints a clickable URL to a picker page that lists every technique / blur / content-visibility combination for both benchmark suites. Open one, then use the Performance tab in DevTools to record a trace while the scenario runs.

You can also construct URLs directly:

```
http://127.0.0.1:3000/benchmarks/reflow-paint-benchmark.html?technique=backdrop-filter&blur=20&contentVisibility=off
http://127.0.0.1:3000/benchmarks/animation-benchmark.html?technique=svg-blur&blur=40&contentVisibility=auto
```

Query parameters:

| Param | Values | Default |
|---|---|---|
| `technique` | `backdrop-filter`, `filter`, `nextjs-blur`, `svg-blur`, `svg-blur-css` | `backdrop-filter` |
| `blur` | `0`–`80` | `20` |
| `contentVisibility` | `off`, `auto` | `off` |
| `image` | any path served by the demo server | `/original/beach.jpg` |

## Generate config files

```bash
pnpm bench:generate-configs
```

This generates:

- `demo/benchmarks/tachometer-reflow.json`
- `demo/benchmarks/tachometer-animation.json`

## Run benchmark suites

```bash
pnpm bench:reflow
pnpm bench:animation
```

Outputs go to `demo/benchmarks/results/`.

### Run against demo server

In one terminal:

```bash
pnpm demo
```

In another terminal:

```bash
BENCH_BASE_URL=http://127.0.0.1:3000 pnpm bench:reflow
BENCH_BASE_URL=http://127.0.0.1:3000 pnpm bench:animation
```

## Analyze Chromium trace logs

```bash
pnpm bench:analyze:reflow
pnpm bench:analyze:animation
```

This summarizes style/layout/paint/commit/composite timing from Tachometer trace files.
