from pathlib import Path

import pytest

from app.services import kiosk_bundle


def _seed(root: Path):
    for bf in kiosk_bundle.BUNDLE_FILES:
        p = root / bf.repo_path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(f"content-of-{bf.name}\n")


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


def test_enable_does_not_change_version(tmp_path):
    # The version hash must depend on file contents only, not the enable field.
    import hashlib

    _seed(tmp_path)
    m = kiosk_bundle.build_manifest(tmp_path)
    blob = "\n".join(
        f"{f['name']}:{f['sha256']}"
        for f in sorted(m["files"], key=lambda f: f["name"])
    )
    assert m["version"] == hashlib.sha256(blob.encode()).hexdigest()[:16]
