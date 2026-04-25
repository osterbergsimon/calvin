from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.plugins.sdk.image import SelfHostedGalleryImagePlugin, fetch_image_data


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
