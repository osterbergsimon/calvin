from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.plugins.sdk.image import (
    ImageConfigField,
    SelfHostedGalleryImagePlugin,
    build_image_manager_config,
    build_image_plugin_metadata,
    create_image_plugin_instance,
    extract_image_config,
    fetch_image_data,
)


@pytest.mark.asyncio
async def test_fetch_image_data_returns_bytes():
    with patch("app.plugins.sdk.image.httpx.AsyncClient") as mock_client:
        mock_response = MagicMock()
        mock_response.content = b"image-bytes"
        mock_response.raise_for_status = MagicMock()
        mock_client.return_value.__aenter__.return_value.get.return_value = mock_response

        data = await fetch_image_data(
            "https://example.com/image.jpg",
            plugin_name="Example",
        )

        assert data == b"image-bytes"


@pytest.mark.asyncio
async def test_fetch_image_data_passes_headers_and_redirects():
    with patch("app.plugins.sdk.image.httpx.AsyncClient") as mock_client:
        mock_response = MagicMock()
        mock_response.content = b"image-bytes"
        mock_response.raise_for_status = MagicMock()
        mock_client.return_value.__aenter__.return_value.get.return_value = mock_response

        await fetch_image_data(
            "https://example.com/image.jpg",
            plugin_name="Example",
            headers={"Authorization": "Bearer token"},
            follow_redirects=True,
        )

        mock_client.assert_called_once_with(timeout=30.0, follow_redirects=True)
        mock_client.return_value.__aenter__.return_value.get.assert_called_once_with(
            "https://example.com/image.jpg",
            headers={"Authorization": "Bearer token"},
        )


@pytest.mark.asyncio
async def test_fetch_image_data_returns_none_for_missing_url():
    assert await fetch_image_data(None, plugin_name="Example") is None


@pytest.mark.asyncio
async def test_fetch_image_data_returns_none_on_http_error():
    with patch("app.plugins.sdk.image.httpx.AsyncClient") as mock_client:
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = httpx.HTTPError("boom")
        mock_client.return_value.__aenter__.return_value.get.return_value = mock_response

        data = await fetch_image_data(
            "https://example.com/image.jpg",
            plugin_name="Example",
        )

        assert data is None


class DummyGalleryPlugin(SelfHostedGalleryImagePlugin):
    sdk_plugin_name = "Dummy Gallery"
    api_base_path = "/api/v2"
    auth_header_name = "x-api-key"

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, object]:
        return {}

    async def initialize(self) -> None:
        pass

    async def cleanup(self) -> None:
        pass

    async def get_images(self) -> list[dict[str, object]]:
        return []

    async def get_image(self, image_id: str) -> dict[str, object] | None:
        return None

    async def get_image_data(self, image_id: str) -> bytes | None:
        return None

    async def scan_images(self) -> list[dict[str, object]]:
        return []

    async def validate_config(self, config: dict[str, object]) -> bool:
        return True


class DummyImagePlugin:
    def __init__(self, plugin_id: str, name: str, enabled: bool = True, **kwargs):
        self.plugin_id = plugin_id
        self.name = name
        self.enabled = enabled
        self.kwargs = kwargs


def test_self_hosted_gallery_build_auth_headers():
    assert DummyGalleryPlugin.build_auth_headers("secret") == {
        "x-api-key": "secret",
        "Accept": "application/json",
    }


def test_self_hosted_gallery_api_url_and_init():
    plugin = DummyGalleryPlugin(
        plugin_id="dummy-gallery",
        name="Dummy Gallery",
        url="https://photos.example.com/",
        api_key="secret",
    )

    assert plugin.base_url == "https://photos.example.com"
    assert plugin.auth_headers() == {
        "x-api-key": "secret",
        "Accept": "application/json",
    }
    assert plugin.api_url("albums/123") == "https://photos.example.com/api/v2/albums/123"


@pytest.mark.asyncio
async def test_self_hosted_gallery_fetch_protected_image_data():
    plugin = DummyGalleryPlugin(
        plugin_id="dummy-gallery",
        name="Dummy Gallery",
        url="https://photos.example.com/",
        api_key="secret",
    )

    with patch("app.plugins.sdk.image.fetch_image_data", autospec=True) as mock_fetch:
        mock_fetch.return_value = b"image-bytes"

        data = await plugin.fetch_protected_image_data("https://photos.example.com/image.jpg")

        assert data == b"image-bytes"
        mock_fetch.assert_awaited_once_with(
            "https://photos.example.com/image.jpg",
            plugin_name="Dummy Gallery",
            headers={"x-api-key": "secret", "Accept": "application/json"},
            follow_redirects=True,
        )


def test_build_image_plugin_metadata():
    metadata = build_image_plugin_metadata(
        type_id="dummy_image",
        name="Dummy Image",
        description="Dummy",
        plugin_class=DummyImagePlugin,
        supports_multiple_instances=False,
        instance_label="Source",
    )

    assert metadata["type_id"] == "dummy_image"
    assert metadata["plugin_type"].value == "image"
    assert metadata["supports_multiple_instances"] is False
    assert metadata["instance_label"] == "Source"
    assert metadata["plugin_class"] is DummyImagePlugin


def test_build_image_plugin_metadata_rejects_app_managed_config_fields():
    with pytest.raises(ValueError, match="app-managed config field"):
        build_image_plugin_metadata(
            type_id="dummy_image",
            name="Dummy Image",
            description="Dummy",
            plugin_class=DummyImagePlugin,
            common_config_schema={"display_order": {"type": "integer"}},
        )


def test_extract_image_config_uses_defaults_and_transforms():
    fields = (
        ImageConfigField("token", default="", converter=str, transform=str.strip),
        ImageConfigField("count", default=1, converter=int),
        ImageConfigField("alias", default="", arg_name="label"),
    )

    values = extract_image_config(
        {"token": "  abc  ", "count": "4", "alias": "Name"},
        fields,
    )

    assert values == {
        "token": "abc",
        "count": 4,
        "label": "Name",
    }


def test_create_image_plugin_instance_builds_kwargs():
    fields = (
        ImageConfigField("token", default="", converter=str),
        ImageConfigField("count", default=1, converter=int),
    )

    plugin = create_image_plugin_instance(
        DummyImagePlugin,
        expected_type_id="dummy_image",
        plugin_id="dummy-instance",
        type_id="dummy_image",
        name="Dummy",
        config={"enabled": True, "token": "abc", "count": "2"},
        fields=fields,
        extra_kwargs=lambda config: {"source": config.get("source", "default")},
    )

    assert plugin is not None
    assert plugin.plugin_id == "dummy-instance"
    assert plugin.enabled is True
    assert plugin.kwargs == {"token": "abc", "count": 2, "source": "default"}


def test_create_image_plugin_instance_returns_none_for_other_type():
    plugin = create_image_plugin_instance(
        DummyImagePlugin,
        expected_type_id="dummy_image",
        plugin_id="dummy-instance",
        type_id="other_image",
        name="Dummy",
        config={},
    )

    assert plugin is None


def test_build_image_manager_config_normalizes_fields_and_extras():
    fields = (
        ImageConfigField("token", default="", converter=str, transform=str.strip),
        ImageConfigField("count", default=1, converter=int),
        ImageConfigField("alias", default="", arg_name="label"),
    )

    manager_config = build_image_manager_config(
        type_id="dummy_image",
        fields=fields,
        single_instance=True,
        instance_id="dummy-instance",
        extra_normalize=lambda config: {"enabled_flag": config.get("enabled", False)},
        default_instance_name="Dummy Image",
    )

    normalized = manager_config.normalize_config(
        {"token": "  abc  ", "count": "3", "alias": "Shown", "enabled": True}
    )

    assert manager_config.single_instance is True
    assert manager_config.instance_id == "dummy-instance"
    assert manager_config.default_instance_name == "Dummy Image"
    assert normalized == {
        "token": "abc",
        "count": 3,
        "alias": "Shown",
        "enabled_flag": True,
    }
