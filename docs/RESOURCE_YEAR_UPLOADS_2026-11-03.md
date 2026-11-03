# Document upload audiences — 2026-11-03

Lecturers can select Year 1, Year 2 or Year 3 under Student year when uploading a document. The selector defaults to the module's year. A successful upload confirms the server-saved audience and refreshes the list; resource cards display the saved year.

Students must be enrolled in the module, satisfy any group restriction and have the matching saved study year. The rule is enforced on the server for resource lists/search/counts, direct files, shared resource attachments and study-session preparation links. A direct link does not bypass the year check.

Migration 034 adds a nullable target year and catalogue index. Existing documents remain unchanged and keep their existing audience. Older upload clients default new documents to the module's year. Upload metadata rejects invalid years and cross-module group references. No production test users or documents are needed for validation.

Validation: 673 automated tests passed (282 unit/component and 391 API), including all three student years and mixed-year group sharing. Three real UI upload-and-access scenarios passed on Chromium at 390px/1280px and Firefox at 390px, with accessibility and overflow checks. A private 48-table production backup was saved before migration.

Production release: source commit `2985a28` was pushed to Rahul’s master branch and deployed to https://eduquest-dun.vercel.app (Vercel deployment `eduquest-d15hlii0i-rahul-521d.vercel.app`). Migration 034 was applied transactionally under a resource-table lock; every pre-existing resource row was verified unchanged apart from the new NULL audience field.

Read-only live checks verified the served year-selector/audience bundle, healthy backend and the authenticated lecturer upload form at 390px, including all three year choices and selecting Year 2. No document was uploaded, reassigned or deleted in production, and no production account/profile was modified for testing. The local network timed out on the initially resolved Vercel edge; verification succeeded against the same canonical hostname through another Vercel edge with normal TLS certificate validation. No system DNS or application security settings were changed.
