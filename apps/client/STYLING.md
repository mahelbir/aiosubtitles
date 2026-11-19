Tailwind CSS v4 + shadcn/ui on **Base UI** (`@base-ui/react`). `src/styles/globals.css` holds nothing but the import
list, and that order is the cascade: framework, then tokens, then the base reset, then the override and bespoke layers.
A new stylesheet is imported into the layer it belongs to, never appended at the end. The token files (`theme.css`,
`themes/`, `semantic.css`) are the theme layer — swapping the palette, adding a custom colour, or changing the
radius/font scales happens there. `base.css` carries no colour value — only the custom
variants, the `@layer base` reset and the reduced-motion block.

- **UI code starts from the installed shadcn and Tailwind skills** — load them before writing or reviewing a call
  site; shadcn's Critical Rules bind every call site outside `ui/`.
- **Fonts live in `app/fonts.js`, `theme-color` in `config/theme.js` — not the theme layer.** `next/font/google` loads
  the faces once and publishes each as its own CSS variable; `themes/<name>.css` only points `--font-sans`/`--font-mono`
  at those, so a new face means editing both. Font loader options must stay written literals — Next rejects a named
  constant there. Each root layout's `viewport` export ships the static `theme-color` for first paint —
  `ThemeColorMeta` then overwrites it with the painted `body` background, so the meta survives a palette swap.
- **Status tints are not tokens.** A tinted surface (`bg-success/10 dark:bg-success/20`, the alpha pair `destructive`
  uses) is written in the owning component's `cva` map — no `--*-surface` token, no shared tone module. A tint-carrying
  `variant` must mirror `destructive` in full (focus ring + link-hover), or the tones diverge. The base colours
  (`--success`/`--warning`) are declared once in `semantic.css`, not per-theme. A tint on a surface that must stay
  opaque — anything sticky, which content scrolls beneath — uses `bg-opaque-*`: the same pair, pre-mixed onto the page
  background so it looks identical to the translucent one.
- **Dark only.** The colour theme is fixed in code (no selector), and so is the mode: `AppThemeProvider` forces
  `next-themes` to `APP_THEME` from `config/theme.js` as its only theme, so no toggle, system preference or stored
  choice reaches light. The theme file still carries `:root` light values, as every generator export does; the forced
  `dark` class always overrides them.
- **`src/components/ui/`** is shadcn CLI output (`.jsx`, excluded from Prettier by the root ignore file, so Prettier
  runs from the repo root). Editing it is expected — shadcn's Open
  Code principle: a new variant extends the component's `cva` map. What shadcn scaffolds there, and into a registry
  item's own `lib/` file, follows shadcn rather than our code rules — everything it ships, such as its hooks, prop names
  and arbitrary values, stays as shipped for `shadcn migrate`; what we add there follows ours. Code still identical to the registry stays as
  shipped when accessibility is the only reason to touch it (an `aria-*` attribute, a label, a role): the call site
  passes it when the component forwards props, otherwise it stays — settled here, never asked. Our edits survive as
  long as no one runs `shadcn add --overwrite`; the default update path is diff-based (`shadcn add <c> --diff`), so
  review upstream churn (via `@base-ui/react` + `shadcn migrate`) and merge by hand. Config: `components.json`.
- **`src/components/common/`** is ours — shared components that are not feature-specific. Normal `.js`, normal
  formatting.
- **The spinner is `ui/spinner.jsx`**, not a wrapper. Its `size-4` default is load-bearing (base-nova sizes bare icons
  to `size-4`, so a spinner carrying a bigger class keeps it inside buttons/menus) and it inherits colour, so no call
  site needs `text-current`. Every call site names it with `LOADING_LABEL` from `components/common/loading-status.js`.
  `PageLoader` is the preset that goes large, `LoadingStatus` the one that stays visually hidden.
- **`src/styles/vendor-overrides/`** — rules against a third-party package's _own_ shipped stylesheet.
  `react-toastify.css` maps `--toastify-*` onto our tokens; its doubled selectors (`:root:root`) raise specificity
  so they win over the package stylesheet. A package that injects its stylesheet at run time is imported through its
  unstyled entry and its stylesheet joins `globals.css` beside its override, so the page CSP serves it as `'self'`.
- **`src/styles/ui-overrides/` is the last resort** — unlike `vendor-overrides/` we own the source, so the first fix is
  always the `components/ui/` file itself (a `cva` variant, a `data-*` prop, folding in a `:has()` rule). A file here is
  justified only when a rule cannot win from inside the component (a cascade/`@layer`-order tiebreak). One file per
  component, not under `themes/` (these must survive a theme swap).
- **`src/styles/app/`** — our own bespoke CSS, keyframes and `@utility` definitions Tailwind does not ship, one file per
  concept. Anything a component can express in its own `cva` map goes there, not here.
- **Motion: prefer transitions.** A page or shared-element transition starts from the installed View Transition
  skill. Base UI drives element entry/exit two ways, and a transition (`data-starting-style` →
  `data-ending-style`) beats a `data-open`/`data-closed` keyframe, since it can be cancelled mid-flight. New overlay
  work uses transitions; a component still on the `tw-animate-css` keyframes shadcn scaffolds is converted when it is
  next touched, and that `globals.css` import goes with the last one. Children that mount/unmount inside a
  **persistent** parent use `@formkit/auto-animate` instead, through `hooks/use-auto-animate.js` — never the package's
  own React hook, which ESLint bans: it stops animating once React re-attaches its ref. It can't animate its own
  parent's mount, so the wrapper stays rendered and the content is conditional; it animates that parent's height too,
  so a flex parent's children take `shrink-0` and a grid parent takes `content-start`. A parent pinned to the bottom
  passes a plugin: a bar fades a leaving child in place, form rows expand in place through `lib/height-motion.js`. A
  swap of a panel's whole content glides through that module's observer rather than the hook, which re-inserts the
  removed node and blocks Base UI's focus restore. The hook keeps a plugin still under reduced motion. A kit shell
  whose children come and go — the form grid, a repeatable list — animates them itself, so a screen never adds a second
  hook on it. The authoritative guide is the animation handbook shipped inside `@base-ui/react`
  (`docs/react/handbook/`).
- **Reduced motion is handled once**, by a global `@media (prefers-reduced-motion: reduce)` block in `base.css` that
  flattens every animation and transition — never per-component `motion-reduce:` variants. An animation that reports
  status joins that block's exemption list; decoration never does. CSS can't reach `window.scrollTo`'s explicit
  `smooth`, so JS scrolling checks the media query itself. `motion` follows the setting through the `MotionConfig` in
  `AppProviders`, which skips every animation it runs.
- **Pick the layer by scope.** A visual variant is always a **prop** on the owning component — never a colour or type
  class in the call site's `className`, nor a `data-*` the call site writes unless that attribute is the shadcn
  component's own API (`Field`'s `data-invalid`). A primitive with no look of its own, such as a bare trigger,
  takes its look at the call site, as `Spinner` takes its colour. Semantic colour → the `cva` `variant` map; a
  structural/positional switch → a prop reflected as `data-*` and read back by `data-[…]:`
  variants in the same `className` (as `Card`/`Sheet`/`Dialog` do for size/side/position). A systemic size →
  a theme token, a custom colour → `semantic.css`. A parent's `:has()` is not a reason to leave the component. Override
  rules sit outside `@layer` (so they beat utilities) and are written against tokens, never raw pixels.
- **No arbitrary values in code we author** — `p-[13px]`, `text-[#333]` are forbidden; define a token instead. Exempt:
  `calc()`/`min()` over existing tokens (`rounded-[min(var(--radius-md),10px)]`).
- **An icon inside a field means `InputGroup`** (`InputGroupAddon` + `InputGroupInput`), never a positioned `<Icon>`
  over a padded `Input`. A field with no addon stays a plain `Input`.
- Primitives are never imported directly from `@base-ui/react`; they arrive through `@/components/ui/*`. Base UI's
  helpers (`mergeProps`, `useRender`) are imported directly; a `render` target outside `ui/` merges its props with its
  host's through `mergeProps`, its className through `cn`.
- Base UI uses a `render` prop where Radix used `asChild`. A link that looks like a button is `LinkButton` — a real
  link carrying the button variants — never a `Button` rendering a `Link`. A link leaving the app is
  `ExternalLinkButton`, and a link set in running text takes the button's `inline` size, so it lines up with the text.
- **Information is revealed by a `Popover` opened on hover; a `Tooltip` only labels.** When opening the popup is the
  trigger's whole purpose — a note, an info tip, the detail behind a badge — it is a hover `Popover`, since Base UI
  disables tooltips on touch. A tooltip sits on a control
  whose purpose lies elsewhere, and that control's accessible name carries the same text.
- Breakpoints: Tailwind variants only, never raw px. Default to `md`. A form lays its fields on `FormGrid`, a `FieldGroup`
  container, so a field's columns follow the form's own width through `@…/field-group:` variants, never the viewport.
- New component: `pnpm dlx shadcn@latest add <name>` from `apps/client`. The CLI installs a registry item's packages
  itself, so run it with `--dry-run` before the real add.
