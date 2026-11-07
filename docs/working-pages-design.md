# Misthra working-page alignment

7 November 2026

The working routes now share the approved homepage's pale studio identity: #f4f4fb ground, white content surfaces, #111827 ink, #2440a6 blue accents, Manrope headings and Inter body text. Primary actions use flat dark ink. The board, detail, posting, agent/profile, account, inbox, leaderboard and guide selectors use the same typography, borders, surfaces, focus colors and control treatment.

## Changes

- `src/styles.css`: replaced warm paper/olive/vermilion colors with a compact cool palette; reduced the oversized condensed hierarchy; increased small labels and body copy; kept clear status/error colors and visible focus. Shared action targets remain at least 44px. Phone mission/agent grids become single-column below 600px.
- `src/components/ui.tsx`: removed decorative mission category tiles and their unused icon mapping. Category labels, rewards, status, timing and complete card links remain.
- `src/pages/Agents.tsx`: missing profile pictures use useful name initials instead of repeated robot/person drawings. Uploaded images remain intact. Each avatar retains a profile-picture accessible name.
- The shared stylesheet hides decorative robot mini-avatars wherever the person's name already identifies the row. Functional wallet, search, navigation, attachment and status icons remain.
- Phone account controls show their existing wallet icon while retaining the full accessible account label. This fixes the header overflow without removing actions.

No page workflows, API calls, authentication, balances, payment behavior or form state changed. `Account.tsx` did not need an edit. Homepage, layout, brand and video files were outside this subtask.

## Verification

- Production build (`npm run build`): TypeScript and Vite completed successfully; final verification recorded by the implementing agent.
- Independent background browser tab on the local production preview: the board and agent directory were visually reviewed at 1280px. Computed heading font is Manrope; page background is rgb(244, 244, 251); document width is 1271px with no horizontal overflow. Board list-view switching rendered four rows and preserved the full card links.
- At a 390px phone viewport, board, agents, mission detail #4, posting, account, inbox, guide and leaderboard each measured 381px document width. Board body copy is 13px. The initial 408px phone-header overflow was reproduced, fixed, reloaded and verified.
- Phone agent directory, mission reward/detail and leaderboard were visually inspected. Mission detail retains reward, fee result, deadline/date, review window, revision count, deliverable and connection action.
- Posting/account/inbox browser checks used their unauthenticated states. Their full guarded states were reviewed through the unchanged source and shared styles; this subtask did not rerun the complete hiring/payment lifecycle.
- Impeccable mechanical scan reported only its generic warning about Inter's popularity. Inter is intentionally retained to match the user-approved homepage; headings use Manrope. Existing Impeccable product/design sidecar schema drift was reported by context loading and was outside this styling task.
- The temporary browser viewport was reset after phone checks.

The linked video, original media, deployment state and existing simulated-HYPE disclosures are unaffected.
