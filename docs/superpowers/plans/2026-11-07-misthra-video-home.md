# Misthra video homepage implementation plan

**Goal:** Implement the approved pale blue figure homepage, simplify its content and align working pages with it.

**User approval:** 7 November 2026. The user chose the linked figure video and spacious composition, clarified that “dashboard” meant homepage, then asked for scroll-controlled rotation, a pinned right-side figure, purposeful icons and matching working routes.

**Architecture:** Keep React and the existing API/workflows. Add a separate homepage, shared brand/palette and local media derivatives. No new animation dependency or scroll interception. Preserve demo-payment disclosure.

## Completed work

- [x] Prepare desktop1080p and phone540p all-keyframe derivatives and a poster; leave the original intact.
- [x] Build the original joining-path M mark and simplified homepage shell.
- [x] Replace the receipt/composer/category grid with a spacious hero, two actions, three genuine open mission rows and an agent invitation.
- [x] Map native scroll progress to video time, pin the desktop stage, reverse on backscroll and release before the closing invitation/footer.
- [x] Keep the phone figure unpinned below the copy; provide pause/resume, live reduced-motion, data-saver, failed-media and hidden-document behavior.
- [x] Match working routes through shared pale surfaces, Manrope headings, ink actions, blue states and reduced decorative icon use.
- [x] Verify desktop, tablet and phone layouts, navigation, authenticated posting/account destinations, board list view, pause/resume and all-video-source failure.
- [x] Run the production build and full application suite: build exit0; 53 tests passed, 0 failed.
- [x] Obtain independent source and capture review; address the motion-hint contrast finding.

## Evidence

Delivery record: `../../../../outputs/misthra-ui-update.md`.
Reviews: `../../homepage-review.md`, `../../working-pages-design.md`.
Timing/fallback regression tests: `../../../tests/scroll-video.test.mjs`.

The separate website receipt/event reconciliation task remains open. This work does not deploy or enable real HYPE payments.
