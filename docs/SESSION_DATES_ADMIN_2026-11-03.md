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
