# Használtautó AI Search — Chrome extension

This repository contains the public Chrome extension client: the search UI, the Használtautó form adapter, and the service API client. Prompting, vehicle matching, catalog snapshots, quotas, provider calls, and stored usage belong to the separate private service repository. No service source or provider credentials belong here.

The extension is self-contained. `quick-search-ui.js` is maintained in this repository; building no longer reads from a sibling web app.

## Production build

Python 3.9 or newer is sufficient; the build has no third-party dependencies. A production build requires one exact HTTPS service origin. The origin is pinned into the extension as a required backend host permission; Chrome requests this access when the extension is installed. The origin is not shown in the user interface:

```sh
BACKEND_ORIGIN='https://api.example.com' python3 build-extension.py dist
```

The output is a Chrome-loadable folder. To create a Chrome Web Store ZIP, zip the *contents* of `dist/` so `manifest.json` is at the ZIP root. Never include credentials in the build.

## Local development

The unpacked source extension is pinned to `http://127.0.0.1:8080` for local development only. The manifest grants that exact loopback origin; the background worker rejects other HTTP origins. For a live-provider check, configure `../backend/.env` with `PROVIDER_MODE=live` and a provider API key, then start the normal Compose stack from `../backend` with `docker compose up --build -d`. Do not add `compose.local.yaml` for this check; that override enables the mock provider. Reload the unpacked extension and the Használtautó page in Chrome. Production bundles still require a pinned HTTPS origin and replace the local host permission during the build.

The extension currently requires an API key issued by the developer. Users can request a key and enter it in the extension settings. The extension uses the detailed Használtautó search path.

## API contract

The extension calls `POST /v1/interpret` and (for a one-use search handoff) `POST /v1/plans/consume`. An API key is required for interpretation; the extension verifies it using `GET /v1/quota` and sends it in the `Authorization` header. Clearing the key removes it from the current browser only; the developer must revoke it separately. The key is stored in `chrome.storage.local` so it survives browser restarts, so treat the extension profile as holding a secret. The extension sends the query, mode, and an opaque request ID only. Search interpretation and validation are handled by the service. See the private service repository's API documentation for the complete contract and operator CLI.

The query remains in active page/request memory during interpretation; it is not placed in a URL or Chrome storage. A one-use plan token, which contains no query text, is removed from the URL fragment before being consumed.

## Public repository note

There is no `LICENSE` file yet. Public visibility alone does not grant reuse rights; choose and add a license before inviting third parties to reuse or redistribute the code.
