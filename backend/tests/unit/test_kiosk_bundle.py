from pathlib import Path

import pytest

from app.services import kiosk_bundle


def _seed(root: Path):
    for bf in kiosk_bundle.BUNDLE_FILES:
        p = root / bf.repo_path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(f"content-of-{bf.name}\n")
    for name, rel in kiosk_bundle.INSTALLER_FILES.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(f"content-of-{name}\n")


def test_manifest_lists_all_files_with_hashes(tmp_path):
    _seed(tmp_path)
    m = kiosk_bundle.build_manifest(tmp_path)
    assert m["min_python"] == "3.9"
    assert len(m["version"]) == 16
    names = {f["name"] for f in m["files"]}
    assert names == {bf.name for bf in kiosk_bundle.BUNDLE_FILES}
    for f in m["files"]:
        assert len(f["sha256"]) == 64
        assert f["target_path"].startswith("/")


def test_version_is_stable_and_content_sensitive(tmp_path):
    _seed(tmp_path)
    v1 = kiosk_bundle.bundle_version(tmp_path)
    assert v1 == kiosk_bundle.bundle_version(tmp_path)  # stable
    (tmp_path / kiosk_bundle.BUNDLE_FILES[0].repo_path).write_text("CHANGED\n")
    assert kiosk_bundle.bundle_version(tmp_path) != v1  # content-sensitive


def test_read_bundle_file_rejects_unknown_name(tmp_path):
    _seed(tmp_path)
    assert kiosk_bundle.read_bundle_file("calvin-x.service", tmp_path)
    with pytest.raises(KeyError):
        kiosk_bundle.read_bundle_file("../../etc/passwd", tmp_path)


def test_manifest_enable_flags(tmp_path):
    _seed(tmp_path)
    m = kiosk_bundle.build_manifest(tmp_path)
    enable = {f["name"]: f["enable"] for f in m["files"]}
    assert enable["calvin-display-agent.service"] is True
    assert enable["calvin-kiosk-remote.service"] is True
    assert enable["calvin-x.service"] is True
    assert enable["calvin_display_agent.py"] is False
    assert enable["update-kiosk.sh"] is False
    assert enable["calvin-kiosk-update.service"] is False


def test_wayland_bundle_files_never_switch_the_stack(tmp_path):
    # A bundle update must not enable the Wayland compositor (or the labwc config)
    # behind setup's back: exactly one compositor unit is enabled, and only
    # setup-kiosk.sh --display-stack decides which.
    _seed(tmp_path)
    m = kiosk_bundle.build_manifest(tmp_path)
    by_name = {f["name"]: f for f in m["files"]}
    for name in ("calvin-wayland.service", "autostart", "rc.xml"):
        assert name in by_name, name
        assert by_name[name]["enable"] is False, name
        assert by_name[name]["restart_unit"] is None, name
    assert by_name["calvin-wayland.service"]["target_path"] == (
        "/etc/systemd/system/calvin-wayland.service"
    )
    assert by_name["autostart"]["target_path"] == ("/home/calvin/.config/labwc/autostart")
    assert by_name["autostart"]["mode"] == "0755"
    assert by_name["rc.xml"]["target_path"] == "/home/calvin/.config/labwc/rc.xml"
    assert by_name["rc.xml"]["mode"] == "0644"


def test_enable_does_not_change_version(tmp_path):
    # The version hash must depend on file contents only, not the enable field.
    import hashlib

    _seed(tmp_path)
    m = kiosk_bundle.build_manifest(tmp_path)
    blob = "\n".join(
        f"{f['name']}:{f['sha256']}" for f in sorted(m["files"], key=lambda f: f["name"])
    )
    assert m["version"] == hashlib.sha256(blob.encode()).hexdigest()[:16]


def test_signed_manifest_verifies(tmp_path, monkeypatch):
    from app.services import kiosk_signing

    _seed(tmp_path)
    keyfile = tmp_path / "kiosk-signing.key"
    monkeypatch.setattr(kiosk_bundle.settings, "kiosk_signing_key_path", keyfile)
    m = kiosk_bundle.build_signed_manifest(tmp_path)
    assert m["sig_alg"] == "hmac-sha256"
    unsigned = {k: v for k, v in m.items() if k not in ("signature", "sig_alg")}
    key = kiosk_signing.load_or_create_key(keyfile)
    assert kiosk_signing.verify(unsigned, m["signature"], key) is True
    # signing does not change the version hash
    assert unsigned["version"] == kiosk_bundle.build_manifest(tmp_path)["version"]


def test_signed_manifest_tamper_detected(tmp_path, monkeypatch):
    from app.services import kiosk_signing

    _seed(tmp_path)
    keyfile = tmp_path / "kiosk-signing.key"
    monkeypatch.setattr(kiosk_bundle.settings, "kiosk_signing_key_path", keyfile)
    m = kiosk_bundle.build_signed_manifest(tmp_path)
    key = kiosk_signing.load_or_create_key(keyfile)
    m["files"][0]["sha256"] = "f" * 64  # tamper after signing
    unsigned = {k: v for k, v in m.items() if k not in ("signature", "sig_alg")}
    assert kiosk_signing.verify(unsigned, m["signature"], key) is False


def test_manifest_lists_installer_hashes(tmp_path):
    # The one-command installer verifies setup-kiosk.sh/setup-common.sh against these
    # (signed) hashes, so a baked signing key authenticates the whole install chain.
    import hashlib

    _seed(tmp_path)
    m = kiosk_bundle.build_manifest(tmp_path)
    got = {f["name"]: f["sha256"] for f in m["installer"]}
    assert set(got) == {"setup-kiosk.sh", "setup-common.sh"}
    want = hashlib.sha256(b"content-of-setup-kiosk.sh\n").hexdigest()
    assert got["setup-kiosk.sh"] == want


def test_installer_hashes_do_not_change_bundle_version(tmp_path):
    # Editing a setup script must not flag every kiosk for an agent update.
    _seed(tmp_path)
    v1 = kiosk_bundle.bundle_version(tmp_path)
    (tmp_path / kiosk_bundle.INSTALLER_FILES["setup-common.sh"]).write_text("CHANGED\n")
    assert kiosk_bundle.bundle_version(tmp_path) == v1


def test_signed_manifest_covers_installer_hashes(tmp_path, monkeypatch):
    from app.services import kiosk_signing

    _seed(tmp_path)
    keyfile = tmp_path / "kiosk-signing.key"
    monkeypatch.setattr(kiosk_bundle.settings, "kiosk_signing_key_path", keyfile)
    m = kiosk_bundle.build_signed_manifest(tmp_path)
    key = kiosk_signing.load_or_create_key(keyfile)
    m["installer"][0]["sha256"] = "f" * 64
    unsigned = {k: v for k, v in m.items() if k not in ("signature", "sig_alg")}
    assert kiosk_signing.verify(unsigned, m["signature"], key) is False


def test_read_installer_file_allowlisted(tmp_path):
    _seed(tmp_path)
    assert kiosk_bundle.read_installer_file("setup-kiosk.sh", tmp_path) == (
        b"content-of-setup-kiosk.sh\n"
    )
    with pytest.raises(KeyError):
        kiosk_bundle.read_installer_file("setup.sh", tmp_path)
    with pytest.raises(KeyError):
        kiosk_bundle.read_installer_file("../scripts/setup-kiosk.sh", tmp_path)


def test_bundle_dir_setting_overrides_repo_dir(tmp_path, monkeypatch):
    # The Docker image ships the bundle outside any checkout (KIOSK_BUNDLE_DIR).
    _seed(tmp_path)
    monkeypatch.setattr(kiosk_bundle.settings, "repo_dir", tmp_path / "nope")
    monkeypatch.setattr(kiosk_bundle.settings, "kiosk_bundle_dir", tmp_path)
    assert kiosk_bundle.read_bundle_file("calvin-x.service")


def _seed_install_template(root: Path):
    p = root / kiosk_bundle.INSTALL_SCRIPT_PATH
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("#!/usr/bin/env bash\nSERVER_URL='@CALVIN_SERVER_URL@'\n")


def test_render_install_script_bakes_server_url(tmp_path):
    _seed_install_template(tmp_path)
    out = kiosk_bundle.render_install_script("http://tower.local:8000/", tmp_path)
    assert "SERVER_URL='http://tower.local:8000'" in out
    assert "@CALVIN_SERVER_URL@" not in out


@pytest.mark.parametrize(
    "url",
    [
        "http://evil'$(reboot)'/",
        "http://host:8000/`id`",
        "ftp://host/",
        "http://host name/",
    ],
)
def test_render_install_script_refuses_unsafe_url(tmp_path, url):
    # The URL comes from the request Host header: never let it inject shell.
    _seed_install_template(tmp_path)
    out = kiosk_bundle.render_install_script(url, tmp_path)
    assert "SERVER_URL=''" in out
    assert "reboot" not in out and "`" not in out


def test_ensure_signing_key_creates_key(tmp_path, monkeypatch):
    keyfile = tmp_path / "sub" / "kiosk-signing.key"
    monkeypatch.setattr(kiosk_bundle.settings, "kiosk_signing_key_path", keyfile)
    assert kiosk_bundle.ensure_signing_key() == keyfile
    assert len(keyfile.read_text().strip()) == 64
