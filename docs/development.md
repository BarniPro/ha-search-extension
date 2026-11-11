# Hosted backend configuration

Users download the extension repository ZIP from GitHub and load the extracted
folder in Chrome. They do not need to build the extension.

The checked-in service worker and manifest currently use localhost. After the
hosted API hostname is chosen, set the exact HTTPS origin in
`background.js` (`CONFIGURED_BACKEND_ORIGIN`) and set the matching host
permission in `manifest.json`, then publish those source files. Never include
provider credentials in the extension. Users enter an operator-issued backend
API key in the popup.

Install the shared folder in Chrome, record its extension ID, and configure the
backend's `ALLOWED_ORIGINS` accordingly. Unpacked extension IDs can vary by
installation path; establish a stable extension identity or explicitly allow
the IDs of pilot users. Keep any private signing key outside the repository.
Verify key validation, quota, one search, and the plan handoff through
Cloudflare before telling users the hosted service is ready.
