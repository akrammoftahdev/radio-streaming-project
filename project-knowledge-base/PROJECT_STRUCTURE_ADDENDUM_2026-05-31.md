# Project Structure Addendum (2026-05-31)

## Frontend File Modifications
### `src/app/admin/admins/page.tsx`
- Refactored to handle Next.js 15+ async `searchParams`.
- Swapped `<a>` tags for `<Link>` tags to prevent page state resets.
- Overhauled side panel forms to include native `<input type="file">` for profile photos and added Name, Email, and Phone fields.

### `src/app/admin/admins/actions.ts`
- Added Node.js `fs` and `path` imports to handle file system writing.
- Updated `createAdmin` and `updateAdmin` Server Actions to parse `File` objects from `FormData`.
- Implemented logic to generate UUID-based filenames and save them to `public/uploads/avatars/`.
- Integrated `PresenterProfile` nested writes (`create` and `upsert`) into the Prisma User queries.
