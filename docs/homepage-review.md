# Misthra homepage and shared UI review

7 November 2026 — independent, bounded review.

## Findings

No open actionable P1/P2 findings. One P2 visual accessibility finding was corrected: the “Scroll to turn.” hint previously used dark ink directly over the figure's dark shoulder. `src/home.css:111` now gives the hint an opaque pale background with padding. The refreshed full-home capture visibly confirms readable hint and motion button text. No other actionable P1/P2 findings were identified in this bounded review.

## Scope and evidence

Reviewed `src/pages/Home.tsx`, `src/lib/scroll-video.ts`, its six mapping/failure tests, `src/home.css`, the shared stylesheet, `Brand.tsx`, `Layout.tsx`, shared UI components and the agent avatar change. Read the homepage plan and working-page implementation report. No implementation files were edited during this review.

- `Home.tsx:19–44`: the video remains paused and seeks from native scroll through the scene. Requests are coalesced into animation frames; seeking catches up after `seeked`; effect cleanup removes listeners and cancels pending frames. User pause, hidden documents, reduced motion, data saving and media failure suppress seeking.
- `Home.tsx:46–60`: the poster remains behind the video, which is exposed only after loaded data. The visual is hidden from assistive technology; the motion button has an explicit action name and explains fixed-motion states. Reduced-motion changes are observed dynamically.
- `home.css:87–119`: desktop uses an actual sticky scene with content passing over the left side. At phone width the figure becomes a separate, unpinned stage to preserve readable copy and actions. Native scrolling and primary links remain available.
- `Layout.tsx`: homepage navigation, wallet access, mobile navigation and the local/simulated-payment disclosure are retained. The `has-notice` layout prevents the header from occupying warning text. Shared focus styling remains visible.
- `ui.tsx:13`, `Agents.tsx:7–11`: mission links, terms, status and reward information remain; removed category tiles and robot placeholders do not remove actions. Name initials and uploaded images retain an accessible profile-picture label.
- The shared-route change is styling and avatar/category presentation. Its implementation report records desktop and phone checks of the board, agents, detail, posting, account, inbox, guide and leaderboard. Guarded states were source-reviewed; their complete lifecycle was not rerun by this reviewer.

## Final validation

Independently viewed the supplied desktop hero, scrolled desktop, phone hero, board list, authenticated posting form, authenticated account and full-home captures under `outputs/errand-preview/misthra-*.jpg`. Copy and actions retain clear separation from the figure; the phone crop preserves the figure and both primary actions. The board, form and account share the pale palette, typography and dark actions. Some viewport captures show only a horizontal crop; the full-home capture establishes the complete homepage composition. This reviewer did not control the root's browser.

Inspected the saved final verification logs: `npm test` completed with 53 passed, zero failed; the TypeScript/Vite build after the contrast correction completed in 1.91 seconds. Six tests cover scene progress, reverse scrolling, final-frame boundaries, invalid/unloaded values, all sources unavailable without a MediaError, and preserving a still-loading fallback source.

The root's live-browser evidence reports desktop scene top −423.5px while the sticky stage stays at 0px, with video time 3.193369s. Pause held 4.008333s while scrolling backward; resume and return to the top restored time 0s. The root also verified board list interaction and authenticated posting/account states. Its all-video-404 fixture retained the loaded 1920px poster and primary links and disabled the motion button with “Background motion off” / “Still image.” Reviewed the resulting `videoUnavailable` helper and source-error handler.

Final disposition: ready for the local preview. The single contrast finding is fixed and visually verified. This is not a broad audit or a production-readiness claim.
