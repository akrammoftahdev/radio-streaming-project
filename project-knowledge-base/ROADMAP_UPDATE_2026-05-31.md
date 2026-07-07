# Roadmap Update (2026-05-31)

## Current Status
- **Admin Management:** Fully operational. CRUD functionality, password resets, status toggling, and native profile photo file uploads are live and deployed on the VPS.
- **Localization:** A sweep of the Admin and Station Manager directories was conducted to remove hardcoded text and ensure 100% `next-intl` compliance.

## Next Steps & Remaining Tasks
1. **Verify Role Scoping:** Ensure that any future features added to the Admin dashboard respect the protected status of the `admin` root account.
2. **Continue i18n Auditing:** Ensure that the user-facing mobile app and public listener pages have no remaining hardcoded Arabic strings.
3. **Database Maintenance:** Monitor the `public/uploads/avatars/` directory to ensure orphaned images (from deleted admins or overwritten photos) are periodically cleaned up, as the current implementation leaves the physical file on disk when a database record is updated.
