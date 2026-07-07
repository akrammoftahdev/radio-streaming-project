# SRS Addendum (2026-05-31)

## Feature Updates: System Administrators

### 1. Admin Profile Requirements
- **Requirement:** When creating or editing a System Admin, the system must allow the entry of full profile information.
- **Fields Added:** Name, Email, Phone, Profile Photo.
- **Data Model:** Links the `User` model (role: ADMIN) to the `PresenterProfile` model to store `avatarUrl` and `displayName`.

### 2. Admin Permissions & Deletion Rules
- **Requirement:** System Admins can create, edit, deactivate, and delete other System Admins.
- **Constraint:** The primary system admin (username `admin`) is strictly protected. The system must prevent deletion, deactivation, or role-stripping of the main admin to prevent system lockouts.

### 3. File Uploads in Admin Forms
- **Requirement:** Admin creation and editing forms must support native image file uploads for profile photos, rather than requiring manual URL entry.
- **Implementation:** The system processes these files synchronously during the form submission server action, saving them to local storage (`public/uploads/avatars/`) and linking the generated URL to the Admin's profile.
