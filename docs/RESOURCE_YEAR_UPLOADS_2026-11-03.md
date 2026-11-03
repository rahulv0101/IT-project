# Document upload audiences — 2026-11-03

Lecturers can select Year 1, Year 2 or Year 3 under Student year when uploading a document. The selector defaults to the module's year. A successful upload confirms the server-saved audience and refreshes the list; resource cards display the saved year.

Students must be enrolled in the module, satisfy any group restriction and have the matching saved study year. The rule is enforced on the server for resource lists/search/counts, direct files, shared resource attachments and study-session preparation links. A direct link does not bypass the year check.

Migration 034 adds a nullable target year and catalogue index. Existing documents remain unchanged and keep their existing audience. Older upload clients default new documents to the module's year. Upload metadata rejects invalid years and cross-module group references. No production test users or documents are needed for validation.

Validation: 673 automated tests passed (282 unit/component and 391 API), including all three student years and mixed-year group sharing. Three real UI upload-and-access scenarios passed on Chromium at 390px/1280px and Firefox at 390px, with accessibility and overflow checks. A private 48-table production backup was saved before migration.
