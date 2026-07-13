# Lessons

- When a pricing model is multiplicative, validate the neutral baseline against observed outcomes before tuning feature weights.
- If a methodology claims special-case behavior, encode that explicitly in the data model and tests so docs and implementation do not drift.
- MLB schedule lineup hydration is not reliable on its own for pregame ordering; use the per-game live feed battingOrder plus player seasonStats and keep a neutral fallback when no confirmed order is posted.
- Avoid browser-target regressions from newer CSS text-wrapping properties unless the support matrix explicitly allows them; prefer broadly supported defaults in shared styles.
- For small-screen control panels, prefer a centered modal over an anchored dropdown when viewport clipping is likely; desktop can keep the anchored popover.
- On tight mobile headers, reduce shared pill height before expanding vertical spacing; matched compact controls preserve hierarchy without wasting room.
- When fallback semantics differ in severity, do not collapse them into one visual marker; reserve the strongest warning state for the truly uncertain case and use a softer badge for partial data gaps.
- If a Vercel project is created with Framework Preset `Other`, a Next.js app can silently deploy as a static site and return a production 404; pin `framework: "nextjs"` in `vercel.json` so deployments stay framework-aware regardless of dashboard defaults.
- Vercel env vars copied with wrapping quotes or trailing newlines can break `@vercel/kv` at runtime; sanitize env values in the KV wrapper and correct the stored production env values instead of assuming the dashboard strips formatting.
- In Next App Router, a stray `app/favicon.ico` adds a generated `/favicon.ico` link ahead of custom SVG metadata icons; if one project relies on branded SVG icons and another does not, remove or replace the `.ico` file so both produce the same head tags.