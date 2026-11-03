# Student Practice Labs — 2026-11-03

The production database contained zero labs, so every student received an empty catalogue. Existing demo exercises were provisioned only by the development seed. Separately, selecting a catalogue card mounted a player with summary data instead of fetching its configuration, leaving the editor/grid/calculator/scenario empty.

Migration 032 publishes four system starter labs: HTML essentials, Monthly budget, Break-even explorer and Customer service decisions. Students can use them without module enrolment. Existing module-specific labs retain their enrolment restrictions, and system content cannot be edited through lecturer endpoints. No production demo seed or synthetic enrolments are required.

The UI loads authorized lab details, reports failed loads, distinguishes starter content and explains unmatched searches. Code drafts and scenario reflections restore after reopening. Spreadsheet saves immediately return server-evaluated formula feedback without exposing expected answers. Practice attempts do not affect quiz scores or leaderboards.

Validation includes 649 passing automated checks (265 unit/component and 384 API), lint, type checking, formatting and a production build. Browser checks cover the four actual starter exercises and saved work alongside existing navigation, game and accessibility regressions. Production deployment evidence is recorded after live verification.
