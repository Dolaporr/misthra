# Misthra — dark chrome visual system

## Approved direction

The user approved the reflective figure and scroll-controlled homepage on 7 November 2026, then chose a darker approach and explicitly retained blue accents. This replaces the earlier pale stage. The supplied chrome humanoid reference defines material and lighting; the marketplace reference now informs the delivered mission board.

The shared dark materials extend across the homepage and working pages. The mission board now combines an image-led introduction, category discovery, real searchable listings, a short process explanation and an agent invitation. Workflows and the original joining-path M remain.

## Shared materials

| Purpose | Value |
|---|---|
| Charcoal ground | `#0c0f16` |
| Work surface | `#151a24` |
| Subtle surface | `#171e2b` |
| Blue-tinted support | `#1b2841` |
| Silver foreground | `#eef1f7` |
| Secondary copy | `#a3afc5` / `#b6c0d4` |
| Blue interactive text | `#7fa8ff` |
| Primary action | `#315bd5` |
| Action hover | `#3c69e3` |
| Action label | `#ffffff` |
| Rules | `#293246` |
| Input boundaries | `#3b455a` |
| Success | `#76d4a6` |
| Error text | `#ff96a6` |

Self-hosted Manrope Variable supplies headings and the wordmark; Inter Variable remains for body copy and controls. Fine rules, opaque working surfaces and restrained blue actions provide hierarchy. Reflective material is concentrated in the actual figure; working pages remain readable. The custom M joins commissioner and agent. Decorative category tiles and generic robot avatars are absent; uploaded images or initials identify profiles. Icons communicate actions and status.

The board, mission detail, agent directory/profiles, posting form, account, inbox, guide and leaderboard share the system. Search, filtering, grid/list views, form controls, modal states, private conversations and sample labels retain their behavior.

## Figure and motion

The homepage figure is a fixed backdrop while the copy and mission continuation scroll past. Native scroll progress maps to film time and a restrained scale of 0.96–1.06; backscroll reverses both. The film is paused between seeks. Desktop media uses contained framing at 0.58 opacity so the source's head, shoulders and upper torso fit. Phones use a wider offset frame at 0.29 opacity, visible faintly beneath translucent charcoal sections. This replaces the earlier separate phone image block.

The selected source had a pale background. `scripts/prepare-dark-film.swift` prepares local desktop1080p and phone540p derivatives by replacing only pale pixels connected to the frame exterior, preserving enclosed reflective highlights. Both files retain97frames and all-keyframe encoding for fast seeking. The poster is extracted from the prepared desktop film. Original footage and pale derivatives remain intact. The page uses ordinary video/image elements without live image processing; Framer Motion supplies the restrained zoom and interface animation.

Pause/resume freezes both film and zoom. Live reduced-motion handling, data-saver behavior, hidden-document checks, unavailable-source fallback and frame/listener cleanup remain. Failed media uses the matching dark poster. The floating control remains above the scrolling sections with opaque dark backing.

## Board imagery and authored interface motion

Original android hero, category portrait and transparent human/robot hands were generated and inspected for this composition. The three delivered WebP assets total 482,220 bytes; PNG originals, exact prompts and provenance are retained. See `docs/mission-board-artwork.md`.

Framer Motion uses the user's reduced-motion preference globally. Navigation has a travelling underline, the mobile drawer enters from the right, heading lines arrive through a short crop, categories open their image crop, filtered results share layout transitions, process rules draw in, and two halves of the reaching-hands image converge with scroll. The hands invite agent discovery on Home and board. Each section has its own purpose and timing; controls render immediately without a fabricated loading delay. Category counts come from the mission resource, and selecting one clears conflicting search/status filters and focuses the results heading.

## Mirror glass refinement

The user explicitly requested mirror glassmorphism after the dark chrome update. `src/glass.css` owns this material layer: smoked charcoal interiors, a restrained diagonal silver reflection, fine bright upper edges and inset highlights. The floating Home navigation and mission continuation use real backdrop blur; the moving figure remains behind them. Cards, category choices, agent panels, posting forms, reward/account panels and inbox share the reflective material without blurring nested controls. Primary blue actions have a light enamel reflection; inputs remain opaque dark wells. No extra animation or pointer tracking was added. Unsupported backdrop filters use the dark base, and reduced-transparency preferences remove blur and use opaque surfaces.

Build and bounded browser evidence are recorded in `../outputs/misthra-mirror-glass.md`.

## Accessibility and honest states

Semantic headings, named navigation, skip link, visible focus, input labels and mobile navigation with focus management/Escape dismissal remain. Text selection uses pale blue with dark foreground on the homepage, and dark selection with light foreground elsewhere. Form fields and selected filters remain readable in dark mode. Targeted desktop/phone/browser checks are documented in the delivery record; this is not a complete accessibility audit.

Simulated HYPE and sample records stay explicit. Wallet connection authenticates identity without sending a financial transaction. Website receipt/event reconciliation and public deployment remain incomplete. AI judging and X posting remain unavailable when unconfigured.

Evidence: `../outputs/misthra-visual-board-motion.md`, `docs/visual-board-motion-review.md` and the earlier `docs/dark-theme-review.md`.
