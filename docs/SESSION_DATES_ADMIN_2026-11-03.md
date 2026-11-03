# Session dates, meeting controls and deactivation — 2026-11-03

Study sessions now provide native minimum dates and end-time bounds plus client-side validation before ISO conversion. The server's shared schema and existing write guard reject elapsed starts on create, edit and duplicate, including recurring creation. Validation reports the actual error instead of hiding it behind generic field feedback. Past records remain readable and cancellable.

The meeting-link field and meeting-opening action are removed. Online sessions save without a link; in-person sessions retain a required Room field. Migration 036 relaxes only online location length while preserving in-person room validation. Existing session rows are unchanged by the migration. Saving an online session through the new form uses an empty location.

The admin issue was confirmed to mean deactivation. A verified/usable admin count was previously combined with an overly broad target check, incorrectly treating a pending unverified administrator as the last usable admin. Both deactivation routes and suspension now protect the last admin only when the target is actually usable. Deactivation remains reversible and preserves data, with clearer matching-email guidance. Own-account and last-usable-admin protection remain intact.

Validation results and live release evidence are appended after the checks complete.

## Validation

- 702 automated tests passed: 302 unit/component and 400 API, zero skips.
- Six browser scenarios passed on Chromium mobile/desktop and Firefox mobile: scheduling/native past-date blocking/link-free mode, RSVP/calendar/notifications/cancellation, plus admin session revocation/suspension/deactivation/activation with retained data.
- API regressions verify past create/edit/duplicate requests fail without changing saved dates; online sessions need no link; in-person rooms remain required; a pending administrator can be deactivated/suspended while the usable administrator stays active.
- Initial new online-session coverage exposed the existing database constraint requiring nonempty locations for all modes; migration 036 resolves that invariant instead of substituting a fake link.
- A private, consistent backup of all 48 production tables was taken before migration. Tests and browser validation used isolated fixtures.

## Release verification

- Source `fe56421` was pushed to Rahul's master branch using Rahul's saved GitHub credentials and deployed to https://eduquest-dun.vercel.app (`dpl_HrbLDxxBPrnaJMhzdLNghp4DJDaP`). Lint, type checking, formatting and production build passed.
- Migration 036 committed after the private backup; the existing production session row was identical before and after the constraint change. No user/account records were changed by the migration.
- An existing verified student group leader opened the actual mobile session form. A past start failed native range validation; online mode had no room/meeting-link control. The form was closed without saving.
- An authenticated past-dated create request returned 422 with “Choose a future start time.” No session was created, edited or cancelled during live verification. The test session was signed out afterward.
- Pending-admin action regressions ran in isolated fixtures. Production user accounts were not deactivated or modified for testing. Own-account/last-usable-admin safeguards remain intentional.
