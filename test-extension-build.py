import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
BUILDER = ROOT / "build-extension.py"


def run_build(output, client_id=None, enable_home_mode=False, backend_origin=None):
    env = os.environ.copy()
    env.pop("GOOGLE_OAUTH_CLIENT_ID", None)
    if client_id:
        env["GOOGLE_OAUTH_CLIENT_ID"] = client_id
    env["ENABLE_HOME_MODE"] = "true" if enable_home_mode else "false"
    env.pop("BACKEND_ORIGIN", None)
    if backend_origin:
        env["BACKEND_ORIGIN"] = backend_origin
    subprocess.run([sys.executable, str(BUILDER), str(output)], cwd=ROOT, env=env, check=True, capture_output=True, text=True)
    return json.loads((output / "manifest.json").read_text())


with tempfile.TemporaryDirectory(prefix="haai-build-", dir=ROOT) as temporary:
    base = Path(temporary)
    plain = base / "plain"
    manifest = run_build(plain)
    assert "identity" not in manifest["permissions"]
    assert "oauth2" not in manifest
    assert "host_permissions" not in manifest
    for script in manifest["background"].values():
        assert (plain / script).is_file()
    assert (plain / "popup.js").is_file()
    assert (plain / "quick-search-ui.js").read_text() == (ROOT / "quick-search-ui.js").read_text()
    for group in manifest["content_scripts"]:
        assert all((plain / script).is_file() for script in group["js"])
    assert not (plain / "search-map.js").exists()
    assert not (plain / "vehicle-map.js").exists()
    assert not (plain / "intent.js").exists()
    assert "const ENABLE_HOME_MODE = false;" in (plain / "background.js").read_text()
    assert "const CONFIGURED_BACKEND_ORIGIN = \"\";" in (plain / "background.js").read_text()
    assert 'apiBaseUrl: "http://localhost:8080"' in (plain / "background.js").read_text()
    assert "https://*/*" not in manifest["optional_host_permissions"]
    assert set(manifest["optional_host_permissions"]) == {
        "http://localhost/*", "http://127.0.0.1/*"
    }

    google = base / "google"
    manifest = run_build(google, "123456789-example.apps.googleusercontent.com")
    assert "identity" in manifest["permissions"]
    assert manifest["oauth2"]["client_id"] == "123456789-example.apps.googleusercontent.com"
    assert "https://www.googleapis.com/auth/userinfo.email" in manifest["oauth2"]["scopes"]
    assert "client_secret" not in json.dumps(manifest)

    home = base / "home"
    manifest = run_build(home, enable_home_mode=True)
    background = (home / "background.js").read_text()
    assert "const ENABLE_HOME_MODE = true;" in background
    assert "homeModeBuildEnabled" in background

    production = base / "production"
    manifest = run_build(production, backend_origin="https://api.example.test:8443")
    assert manifest["optional_host_permissions"] == ["https://api.example.test:8443/*"]
    background = (production / "background.js").read_text()
    assert 'const CONFIGURED_BACKEND_ORIGIN = "https://api.example.test:8443";' in background
    assert "localBackendAllowed: !CONFIGURED_BACKEND_ORIGIN" in background

    production_b = base / "production-b"
    manifest = run_build(production_b, enable_home_mode=True, backend_origin="https://api.example.test:8443")
    background = (production_b / "background.js").read_text()
    assert manifest["optional_host_permissions"] == ["https://api.example.test:8443/*"]
    assert "const ENABLE_HOME_MODE = true;" in background
    shipped_source = "\n".join(path.read_text() for path in production_b.rglob("*") if path.is_file())
    for forbidden in ["ADVANCED_SYSTEM", "VEHICLE_MAP", "SEARCH_MAP"]:
        assert forbidden not in shipped_source, f"Legacy model/catalog code must not ship: {forbidden}"
    for forbidden_file in ["search-map.js", "vehicle-map.js", "home-map.js", "home-core.js", "advanced-core.js", "clarify.js", "intent.js", "adapter.js"]:
        assert not (production_b / forbidden_file).exists(), f"Legacy source file must not ship: {forbidden_file}"

    for invalid in ["http://api.example.test", "https://api.example.test/path", "https://user@api.example.test", "https://*.example.test", "https://[::1]"]:
        env = os.environ.copy()
        env["BACKEND_ORIGIN"] = invalid
        result = subprocess.run([sys.executable, str(BUILDER), str(base / "invalid")], cwd=ROOT, env=env, capture_output=True, text=True)
        assert result.returncode != 0, f"Rejected invalid BACKEND_ORIGIN: {invalid}"

    occupied = base / "occupied"
    occupied.mkdir()
    sentinel = occupied / "keep-me.txt"
    sentinel.write_text("preserve this user file\n")
    env = os.environ.copy()
    env.pop("BACKEND_ORIGIN", None)
    env.pop("GOOGLE_OAUTH_CLIENT_ID", None)
    env["ENABLE_HOME_MODE"] = "false"
    result = subprocess.run([sys.executable, str(BUILDER), str(occupied)], cwd=ROOT, env=env, capture_output=True, text=True)
    assert result.returncode != 0, "Refuses to build over an existing output directory"
    assert "Output path already exists" in result.stderr
    assert sentinel.read_text() == "preserve this user file\n"

print("Build outputs include only manifest files; origin pinning, overwrite refusal, and optional OAuth wiring passed")
