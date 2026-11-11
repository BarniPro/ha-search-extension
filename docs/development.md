# Hosted backend configuration

Users download the extension repository ZIP from GitHub and load the extracted
folder in Chrome. They do not need to build the extension.

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
