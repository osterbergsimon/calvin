"""Integration tests for image API endpoints."""

import pytest

from tests.test_utils import create_test_image, create_test_images_set


@pytest.mark.integration
class TestImageAPI:
    """Test image API endpoints."""

    def test_upload_image(self, test_client, temp_image_dir):
        """Test uploading an image."""
        # Create a test image
        image_data = create_test_image(format="JPEG", width=100, height=100)

        # Upload image
        response = test_client.post(
            "/api/images/upload", files={"file": ("test_image.jpg", image_data, "image/jpeg")}
        )

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data.get("filename") == "test_image.jpg"

    def test_upload_multiple_formats(self, test_client, temp_image_dir):
        """Test uploading images in different formats."""
        formats = [
            ("JPEG", "image/jpeg", "test.jpg"),
            ("PNG", "image/png", "test.png"),
            ("WEBP", "image/webp", "test.webp"),
        ]

        for format_type, mime_type, filename in formats:
            image_data = create_test_image(format=format_type)

            response = test_client.post(
                "/api/images/upload", files={"file": (filename, image_data, mime_type)}
            )

            assert response.status_code == 200
            data = response.json()
            assert data.get("filename") == filename

    def test_get_images_list(self, test_client, temp_image_dir):
        """Test getting list of images."""
        # Create some test images
        create_test_images_set(temp_image_dir, count=3)

        # Get images list
        response = test_client.get("/api/images/list")

        assert response.status_code == 200
        data = response.json()
        assert "images" in data
        # Should have at least our test images
        assert len(data["images"]) >= 3

    def test_get_current_image(self, test_client, temp_image_dir):
        """Test getting current image."""
        # Create test images
        create_test_images_set(temp_image_dir, count=2)

        # Get current image
        response = test_client.get("/api/images/current")

        assert response.status_code == 200
        data = response.json()
        # Should return an image or None if no images
        assert "image" in data

    def test_get_image_by_id(self, test_client, temp_image_dir):
        """Test getting a specific image by ID."""
        # Create test images
        create_test_images_set(temp_image_dir, count=1)

        # Get images list to find an ID
        response = test_client.get("/api/images/list")
        assert response.status_code == 200
        images = response.json().get("images", [])

        if images:
            image_id = images[0]["id"]

            # Get image by ID
            response = test_client.get(f"/api/images/{image_id}")
            assert response.status_code == 200
            # Should return image data
            assert response.headers["content-type"].startswith("image/")

    def test_delete_image(self, test_client, temp_image_dir):
        """Test deleting an image."""
        # Create and upload a test image
        image_data = create_test_image()
        upload_response = test_client.post(
            "/api/images/upload", files={"file": ("test_delete.jpg", image_data, "image/jpeg")}
        )

        if upload_response.status_code == 200:
            image_id = upload_response.json()["id"]

            # Delete the image
            response = test_client.delete(f"/api/images/{image_id}")
            assert response.status_code == 200

            # Verify it's deleted
            response = test_client.get(f"/api/images/{image_id}")
            assert response.status_code == 404

    def test_next_image(self, test_client, temp_image_dir):
        """Test navigating to next image."""
        # Create test images
        create_test_images_set(temp_image_dir, count=3)

        # Navigate to next image
        response = test_client.post("/api/images/next")

        assert response.status_code == 200
        data = response.json()
        assert "image" in data

    def test_previous_image(self, test_client, temp_image_dir):
        """Test navigating to previous image."""
        # Create test images
        create_test_images_set(temp_image_dir, count=3)

        # Navigate to previous image
        response = test_client.post("/api/images/previous")

        assert response.status_code == 200
        data = response.json()
        assert "image" in data
