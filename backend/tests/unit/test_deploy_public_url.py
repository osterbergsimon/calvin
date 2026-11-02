"""PUBLIC_URL must reach the container in every shipped server deploy (CLV-11).

Behind Docker NAT the backend only sees its container IP, so the phone/QR
hand-off and the "Add kiosk" command depend on PUBLIC_URL being passed through.
"""

import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[3]


def test_compose_passes_public_url_from_env():
    compose = yaml.safe_load((REPO / "docker" / "docker-compose.yml").read_text())
    env = compose["services"]["calvin"]["environment"]
    assert "PUBLIC_URL" in env
    assert "${PUBLIC_URL" in env["PUBLIC_URL"]


def test_unraid_template_exposes_public_url():
    root = ET.parse(REPO / "deploy" / "unraid" / "calvin.xml").getroot()
    targets = {c.get("Target") for c in root.iter("Config") if c.get("Type") == "Variable"}
    assert "PUBLIC_URL" in targets


def test_env_example_documents_public_url():
    assert "PUBLIC_URL=" in (REPO / "deploy" / "calvin.env.example").read_text()
