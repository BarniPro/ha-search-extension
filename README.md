# HAHU kereső — Használtautó AI Search

<table>
  <tr>
    <th>Mobile screenshot</th>
    <th>Desktop preview (illustrative)</th>
  </tr>
  <tr>
    <td valign="top" width="25%"><img src="docs/screenshots/mobile.png" alt="Mobile layout of Használtautó.hu with the natural-language car search field above the standard filters" width="240"></td>
    <td valign="top" width="75%"><img src="docs/previews/desktop.svg" alt="Illustrative desktop product preview, not a screenshot: a natural-language car search field above the standard Használtautó search filters" width="720"></td>
  </tr>
</table>

**Describe the car you want. Let the extension set the filters.**

HAHU kereső adds a Hungarian natural-language search field to [Használtautó.hu](https://www.hasznaltauto.hu/kereso). It turns your description into the site's own search filters and opens the matching listings.

> automata Honda HR-V 7 millióig, 2019-től

Search by make, model, price, year, mileage, or equipment in one sentence. Short descriptions without Hungarian accents work too. If a condition cannot be applied, a notice appears on the results page. Above: an actual mobile screenshot and an illustrative desktop preview of the responsive interface.

## Get started

You need Chrome, a build configured for a running service, and an API key issued by the developer. The source checkout uses a local development service; see [Local development](#local-development).

1. Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**. Choose the configured extension folder (`dist/` for a production build).
2. Open **HAHU kereső** from Chrome's extensions menu. Paste your API key and select **Ellenőrzés és mentés** to verify and save it. The popup shows your remaining searches.
3. Open or reload the [Használtautó search page](https://www.hasznaltauto.hu/kereso), describe the car you want, and select **Keresés** beside the new field.

The search text is processed by an external AI provider. AI can make mistakes: review the applied filters, results, and any notice about conditions that could not be applied.

## Production build

Python 3.9 or newer is sufficient; no third-party dependencies are needed. Run from this repository with your service's exact HTTPS origin:

```sh
BACKEND_ORIGIN='https://api.example.com' python3 build-extension.py dist
```

Replace the example origin with your deployed service. It must have no path, query, credentials, or fragment. The build pins it into the extension and replaces the local backend host permission. Chrome requests this required access when the extension is installed; the origin is not shown in the extension UI. Never include credentials in a build.

The output is a Chrome-loadable folder. The builder refuses to overwrite an existing output path. For a Chrome Web Store ZIP, zip the **contents** of `dist/` so `manifest.json` is at the ZIP root.

## Local development

Load this repository folder as an unpacked extension. The source is pinned to `http://127.0.0.1:8080` for development only. Its manifest grants that exact loopback origin, and the background worker rejects other HTTP origins. Production builds require a pinned HTTPS origin.

If you have the separate private service checked out at `../backend`, configure its `.env` with `PROVIDER_MODE=live` and a provider API key, then start it from that directory:

```sh
docker compose up --build -d
```

For a live-provider check, use the normal Compose stack; `compose.local.yaml` enables the mock provider. Save a developer-issued extension API key in the popup, then reload the extension and the Használtautó page after changes.

## Privacy and API keys

- The extension API key is verified through `GET /v1/quota` and sent in the `Authorization` header. It is stored in `chrome.storage.local` and survives browser restarts, so treat the browser profile as holding a secret.
- Removing a key in the popup removes it from the current browser only. Ask the developer to revoke the key separately.
- Interpretation sends only the query, mode, and an opaque request ID to `POST /v1/interpret`. The query stays in active page/request memory; it is not placed in a URL or Chrome storage.
- A search handoff uses `POST /v1/plans/consume`. Its one-use token contains no query text and is removed from the URL fragment before consumption.

## Repository scope

This public repository contains the extension UI, Használtautó form adapter, and service API client. The extension uses the detailed Használtautó search path. `quick-search-ui.js` is maintained here; building does not read from a sibling web app.

Prompting, vehicle matching, catalog snapshots, quotas, provider calls, and stored usage belong to the separate private service repository. Service source and provider credentials do not belong here. See that repository's API documentation for the complete contract and operator CLI.

## License

There is no `LICENSE` file yet. Public visibility alone does not grant reuse rights; a license must be added before inviting third parties to reuse or redistribute the code.
