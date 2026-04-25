from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.plugins.sdk.image import fetch_image_data


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
