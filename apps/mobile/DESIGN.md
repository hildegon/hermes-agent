# Mobile adaptation of Hermes Desktop

Visual authority: ../desktop/DESIGN.md and ../desktop/src/styles.css. Keep chat primary, flat rows, blue action color, quiet chrome, explicit context, and tools attached to the current agent. No replacement visual identity.

Operate mode: machine selection → agent profile → chat and tools. Compact widths use five labeled navigation destinations; expanded widths use a navigation rail. Controls have 48 CSS pixel hit areas, safe-area padding, visible focus, reduced-motion support, and light/dark color schemes. Do not replace a foreground conversation in response to a background event.

Mobile tokens retain the desktop roles: --theme-primary, --ui-text-primary/secondary, --ui-bg-primary/secondary and --ui-stroke. The default accent comes from the existing #0053fd desktop theme; a brighter accent is used on dark surfaces. System text is the fallback face. Monospace is reserved for file contents, diffs and terminals.

Limits: native Android interaction and keyboard behavior require emulator/device verification; browser captures alone cannot certify them.
