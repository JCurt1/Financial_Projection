# Financial Command Center — AI Rules

## Architecture

- `calculations/*` — **pure functions only**. Never import `document` or query the DOM.
- `ui/*` — **DOM only**. Never perform financial math beyond display formatting (`formatCurrency`).
- `config/*` — All magic numbers (401k limits, tax brackets, FI multiplier, drawdown rates).
- `state/store.js` — Single source of truth for application state. Use `setState()` to mutate.

## Data flow

```
User input → setState() → subscribe() → computeAll() → renderDashboard()
```

Read `js/calculations/index.js` for the `ComputedResult` object shape before editing UI renderers.

## State key contract

Balance sheet card `data-key` attributes must match keys in `js/state/defaults.js`:

`cash`, `retirement`, `homeValue`, `brokerage`, `consumerDebt`, `mortgage`

## Before editing

1. Identify which layer: **calculation**, **UI**, or **config**.
2. If adding a metric: add calculation first, then a UI renderer, register both in `calculations/index.js` and `ui/render-dashboard.js`.
3. Do not add logic to `main.js` beyond module wiring.

## Forbidden

- DOM calls inside `calculations/*`
- Financial math inside `ui/*` (except `formatCurrency` / `parseInputVal`)
- New global variables on `window`
- Inline `onclick` handlers — use `addEventListener` in `ui/*` modules
- Hardcoding constants that belong in `config/constants.js` or `config/tax-brackets-2024.js`

## Safe extension pattern

New feature = new file in `calculations/` + new file in `ui/` + register in orchestrator and renderer.

## CSS

Component styles live in `css/components/` and mirror UI module names. Edit the matching pair together.

## Running locally

ES modules require HTTP (not `file://`):

```bash
npx serve .
```

Then open `http://localhost:3000`.
