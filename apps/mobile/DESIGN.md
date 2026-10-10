# Mobile adaptation of Hermes Desktop

Visual authority: ../desktop/DESIGN.md and ../desktop/src/styles.css. Keep chat primary, flat rows, blue action color, quiet chrome, explicit context, and tools attached to the current agent. No replacement visual identity.

Operate mode: machine selection → agent profile → chat and tools. Compact widths use five labeled navigation destinations; expanded widths use a navigation rail. Controls have 48 CSS pixel hit areas, safe-area padding, visible focus, reduced-motion support, and light/dark color schemes. Do not replace a foreground conversation in response to a background event.

Mobile tokens retain the desktop roles: --theme-primary, --ui-text-primary/secondary, --ui-bg-primary/secondary and --ui-stroke. Use the default Nous palette from apps/shared/src/theme-presets.ts: #0053fd light / #4a84fe dark, white / #0d1117 transcript and #f6f8fa / #010409 chrome. Secondary dark text is lifted to #9da7b3 for mobile contrast. System text is the fallback face. Monospace is reserved for file contents, diffs and terminals.

Limits: native Android interaction and keyboard behavior require emulator/device verification; browser captures alone cannot certify them.

Desktop fidelity: reuse the original nous-girl light/dark brand assets (MIT, apps/desktop/public), the desktop UI text font stack, 4px controls, 12px composer, blue user bubbles, quiet title/profile/session controls and flat tool lists. Phone headings are 20/18px (sign-in title 24px) with 48px touch targets; native navigation remains at the bottom. Assets are copied from the repository, not generated.
User bubble speaker labels use primary text to retain AA contrast over the blue fill.

Further Desktop refinement: original desktop launcher icon reused for Android legacy and adaptive masks; quiet brand header, avatar labels for Hermes replies, content-sized right-aligned user bubbles, flat selected navigation with a hairline indicator, white/input-surface composer and circular send action. All interactive targets retain 48px minimums.
