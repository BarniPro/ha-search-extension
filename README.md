# Használtautó AI Search — Chrome extension

This repository contains the public Chrome extension client: the search UI, the Használtautó form adapter, and the API client. Prompting, vehicle matching, catalog snapshots, quotas, authentication, provider calls, and stored usage belong to the separate private backend repository. No backend source or provider credentials belong here.

The extension is self-contained. `quick-search-ui.js` is maintained in this repository; building no longer reads from a sibling web app.

## Build

Python 3.9 or newer is sufficient; the build has no third-party dependencies. A local development build can connect only to localhost or 127.0.0.1:

```sh
python3 build-extension.py dist
```

A pilot/release build pins one exact HTTPS backend origin at build time. The URL becomes the only optional host permission and the backend field is locked to it:

```sh
BACKEND_ORIGIN='https://api.example.com' python3 build-extension.py dist
```

The output is a Chrome-loadable folder. To create a Chrome Web Store ZIP, zip the *contents* of `dist/` so `manifest.json` is at the ZIP root. Never include credentials in the build.

Google sign-in is optional. A build with OAuth requires only the public client ID; no OAuth client secret or provider key is included:

```sh
GOOGLE_OAUTH_CLIENT_ID='123456789-example.apps.googleusercontent.com' \
  BACKEND_ORIGIN='https://api.example.com' python3 build-extension.py dist-oauth
```

Guest mode remains available without OAuth. The optional homepage mode (B) is disabled in the default build and must be enabled in both the extension build and backend configuration. A live Használtautó homepage smoke check is required before enabling it for a partner.

## API contract

The extension calls `POST /v1/guest`, `POST /v1/interpret`, and (for a one-use search handoff) `POST /v1/plans/consume`. It sends the query, mode, and an opaque request ID only. The backend owns prompt logic and validates returned native form operations. See the private backend repository's API documentation for the complete contract.

The query remains in active page/request memory during interpretation; it is not placed in a URL or Chrome storage. A one-use plan token, which contains no query text, is removed from the URL fragment before being consumed.

## Checks

Run the extension regression and build checks from this directory:

```sh
node test-background-client.js
node test-native-adapter.js
node test-smoke-paths.js
python3 test-extension-build.py
```

These tests use local mocks. They do not contact an AI provider or prove that Használtautó's live DOM has not changed.

To exercise the real extension service-worker client against the sibling backend's HTTP API with a deterministic fake provider, run `python3 verify-repositories.py` from this workspace root. This local integration check covers extension-origin CORS, guest-token issuance, interpretation request/response fields, and the one-use plan handoff; it binds only to loopback and sends no provider request.

## Public repository note

There is no `LICENSE` file yet. Public visibility alone does not grant reuse rights; choose and add a license before inviting third parties to reuse or redistribute the code.
