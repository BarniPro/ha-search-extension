#!/usr/bin/env python3
"""Build a loadable extension folder without shipping legacy analysis files."""

import json
import os
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
OUTPUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "dist"


def runtime_files(manifest):
    files = [manifest["background"]["service_worker"], manifest["action"]["default_popup"]]
    popup = (ROOT / manifest["action"]["default_popup"]).read_text()
    files.extend(re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)["\']', popup, re.IGNORECASE))
    for entry in manifest.get("content_scripts", []):
        files.extend(entry.get("js", []))
        if entry.get("css"):
            files.extend(entry["css"])
    return sorted(set(files))


def parse_backend_origin(value):
    if not value:
        return None
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError as error:
        raise SystemExit("BACKEND_ORIGIN is not a valid origin.") from error
    if (parsed.scheme != "https" or not hostname or parsed.username or parsed.password or
            parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise SystemExit("BACKEND_ORIGIN must be one exact HTTPS origin with no path, query, credentials, or fragment.")
    try:
        host = hostname.encode("idna").decode("ascii").lower()
    except UnicodeError as error:
        raise SystemExit("BACKEND_ORIGIN must use a valid DNS host.") from error
    label = r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
    if len(host) > 253 or not re.fullmatch(rf"{label}(?:\.{label})*", host):
        raise SystemExit("BACKEND_ORIGIN must use one exact DNS host; IP-literal IPv6 and wildcard hosts are not supported.")
    origin = f"https://{host}{f':{port}' if port and port != 443 else ''}"
    return origin


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text())
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    backend_origin = parse_backend_origin(os.environ.get("BACKEND_ORIGIN", "").strip())
    if backend_origin:
        manifest["optional_host_permissions"] = [f"{backend_origin}/*"]
    mode_flag = os.environ.get("ENABLE_HOME_MODE", "false").strip().lower()
    if mode_flag not in {"", "0", "false", "no", "1", "true", "yes"}:
        raise SystemExit("ENABLE_HOME_MODE must be true or false.")
    enable_home_mode = mode_flag in {"1", "true", "yes"}
    if client_id:
        if not re.fullmatch(r"[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com", client_id):
            raise SystemExit("GOOGLE_OAUTH_CLIENT_ID is not a Google OAuth client ID.")
        manifest["permissions"] = sorted(set(manifest.get("permissions", [])) | {"identity"})
        manifest["oauth2"] = {
            "client_id": client_id,
            "scopes": [
                "https://www.googleapis.com/auth/userinfo.email",
                "https://www.googleapis.com/auth/userinfo.profile",
            ],
        }

    if OUTPUT.exists() or OUTPUT.is_symlink():
        raise SystemExit(f"Output path already exists; refusing to overwrite it: {OUTPUT}")
    OUTPUT.mkdir(parents=True)
    for relative in runtime_files(manifest):
        source = ROOT / relative
        if not source.is_file():
            raise SystemExit(f"Manifest references a missing file: {relative}")
        destination = OUTPUT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if relative == manifest["background"]["service_worker"]:
            contents = source.read_text()
            if enable_home_mode:
                marker = "const ENABLE_HOME_MODE = false;"
                if contents.count(marker) != 1:
                    raise SystemExit("Could not locate the extension home-mode build gate.")
                contents = contents.replace(marker, "const ENABLE_HOME_MODE = true;", 1)
            if backend_origin:
                marker = 'const CONFIGURED_BACKEND_ORIGIN = "";'
                if contents.count(marker) != 1:
                    raise SystemExit("Could not locate the extension backend-origin build setting.")
                contents = contents.replace(marker, f"const CONFIGURED_BACKEND_ORIGIN = {json.dumps(backend_origin)};", 1)
            destination.write_text(contents)
            shutil.copystat(source, destination)
        else:
            shutil.copy2(source, destination)
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Built extension at {OUTPUT}")
    print("Google OAuth: configured" if client_id else "Google OAuth: disabled (guest mode remains available)")
    print("B mode: build-enabled (popup and backend gates still required)" if enable_home_mode else "B mode: disabled in this build")
    print(f"Backend origin: {backend_origin}" if backend_origin else "Backend origin: localhost/127.0.0.1 development only")


if __name__ == "__main__":
    main()
