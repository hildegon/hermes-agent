# Hermes Mobile
<!-- impeccable:product-schema 1 -->
## Platform
mobile
## Stack
React and TypeScript in Capacitor on Android, approved in the implementation plan.
## Users
Sergio controls his Hermes agents from an Android phone, including machines running macOS, Bazzite, Windows and Ubuntu.
## Product Purpose
Connect several PCs to one self-hosted private service and operate their existing Hermes agents remotely. Success means working chat, approvals, configuration, files, Git and interactive terminals.
## Operating Context
Private Tailscale network. The Mac mini hosts the registry/proxy; owners may deploy their own Node/Docker service. Remote agents continue to run on their PCs. Optional experimental local mode runs Hermes in Termux/PRoot on the phone and uses a user-enabled accessibility service for explicitly authorized apps.
## Brand Commitments
Preserve the recognizable Hermes Desktop interface and MIT attribution. This is an independent adaptation, not an official Nous Research release.
## Capabilities and Constraints
Android first, one local owner authenticated by an installation access key, QR pairing, no public registration or Funnel in the first release. No invented machines or conversation history in production. No external identity service or app registration is required. Network and service configuration belong to the owner. Local phone chat needs no Tailscale or registry; the app guides installation of Termux and prepares Hermes automatically on Android 13+ arm64, then configures provider access. UI operations require an unlocked device.

## Direction contract
THESIS: Adapt the user's Hermes Desktop workflow to one phone while keeping the selected machine and profile explicit.
OWN-WORLD: Inherit flat desktop surfaces, blue primary actions, light/dark tokens and quiet chrome; no new visual brand.
STORY: Sign in, select a PC/profile, then chat or use its existing tools. Tasks remain on the PC when the phone leaves.
FIRST VIEWPORT: On entry, a compact Hermes title above the private server and access key fields with a Connect action. In a workspace, machine header and profile selector precede the transcript; composer and five labeled tools sit at the bottom.
FORM: Code-led adaptation of an incumbent desktop system; the user's request pins this form, so no new-world seed or image comp is used.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
