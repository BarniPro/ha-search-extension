# Hosted backend configuration

Users can download the versioned `hahu-kereso.zip` attached to a GitHub Release
or download the current repository ZIP. They extract the ZIP and load the folder
containing `manifest.json` in Chrome; they do not need to build the extension.

The checked-in service worker and manifest use `https://demo.lorinczbarnabas.hu`.
To change it, update `CONFIGURED_BACKEND_ORIGIN` in `background.js`, the
matching host permission in `manifest.json`, and the build script marker. Never include
provider credentials in the extension. Users enter an operator-issued backend
API key in the popup.

The manifest contains a public key to give unpacked copies a stable Chrome
extension ID across installation paths. It is public identity material, not a
signing key. Configure that extension ID in the backend's `ALLOWED_ORIGINS`.
Verify key validation, quota, one search, and the plan handoff through
Cloudflare before telling users the hosted service is ready.
