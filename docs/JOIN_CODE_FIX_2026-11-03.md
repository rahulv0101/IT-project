# Saved module join-code visibility — 2026-11-03

The creation endpoint returned a join code, but the saved-module catalogue omitted it. The lecturer could see a newly created code only while that screen retained its local state. Reloading, navigating away or signing in again lost that display.

The lecturer-owned catalogue now returns the existing join code. Each lecturer module card displays a selectable “Student join code” field and Copy button, with sharing instructions and a manual-copy fallback. Repeated catalogue reads do not generate or rotate codes. Other lecturers' modules remain outside the ownership filter; student catalogue responses omit the field.

Validation:

- 646 unit/component/API tests passed (264 unit/component and 382 API), with no skipped tests.
- Lint, type checking, formatting and production build passed.
- Browser regression checks cover reload, navigation, fresh sign-in, clipboard copying, student presentation, accessibility and mobile overflow.
