"""Integration tests for image API endpoints."""

from pathlib import Path

import pytest

from app.database import AsyncSessionLocal
from app.models.db_models import PluginDB
from tests.test_utils import create_test_image, create_test_images_set


@pytest.mark.integration
class TestImageAPI:
    """Test image API endpoints."""

    def setup_method(self):
        """Set up test - enable local image plugin."""
        # This will be called before each test method
        pass

    def _ensure_local_plugin_enabled(self, test_client):
        """Ensure the local image plugin is enabled and has an instance."""
        import asyncio

        from sqlalchemy import select

        # Just enable the plugin type - the hook will handle instance creation
        # This matches how calendar tests work - they don't manually create instances
        response = test_client.put("/api/plugins/local", json={"enabled": True})
        assert response.status_code == 200, f"Failed to enable plugin: {response.text}"

        # Ensure the instance exists in the database by querying it
        # This ensures the database is in sync before making API calls
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:

            async def check_instance():
                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        select(PluginDB).where(PluginDB.id == "local-images")
                    )
                    instance = result.scalar_one_or_none()
                    if not instance:
                        # Instance doesn't exist, create it manually
                        from datetime import datetime

                        instance = PluginDB(
                            id="local-images",
                            type_id="local",
                            plugin_type="image",
                            name="Local Images",
                            enabled=True,
                            display_order=0,
                            created_at=datetime.utcnow(),
                            updated_at=datetime.utcnow(),
                        )
                        session.add(instance)
                        await session.commit()
                    elif not instance.enabled:
                        # Instance exists but is disabled, enable it
                        instance.enabled = True
                    await session.commit()
                    # Flush to ensure the instance is visible to other sessions
                    await session.flush()

            loop.run_until_complete(check_instance())

            # Verify instance exists
            async def verify_instance():
                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        select(PluginDB).where(PluginDB.id == "local-images")
                    )
                    instance = result.scalar_one_or_none()
                    instance_id = instance.id if instance else "NOT FOUND"
                    instance_enabled = instance.enabled if instance else "N/A"
                    print(
                        f"[TEST DEBUG] Plugin instance in DB: {instance_id}, "
                        f"enabled: {instance_enabled}"
                    )
                    return instance is not None

            instance_exists = loop.run_until_complete(verify_instance())
            assert instance_exists, "Plugin instance was not created in database"
        finally:
            loop.close()

    def test_upload_image(self, test_client, temp_image_dir):
        """Test uploading an image."""

        # Ensure local plugin is enabled
        self._ensure_local_plugin_enabled(test_client)

        # Create a test image
        image_data = create_test_image(format="JPEG", width=100, height=100)

        # Upload image
        response = test_client.post(
            "/api/images/upload", files={"file": ("test_image.jpg", image_data, "image/jpeg")}
        )

        assert response.status_code == 200
        data = response.json()
        assert "image" in data
        assert "id" in data["image"]
        assert data["image"].get("filename") == "test_image.jpg"

    def test_upload_multiple_formats(self, test_client, temp_image_dir):
        """Test uploading images in different formats."""
        # Ensure local plugin is enabled
        self._ensure_local_plugin_enabled(test_client)

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
            assert "image" in data
            assert data["image"].get("filename") == filename

    def test_get_images_list(self, test_client, temp_image_dir):
        """Test getting list of images."""
        import os

        print("\n[TEST DEBUG] ===== test_get_images_list starting =====")
        print(f"[TEST DEBUG] temp_image_dir: {temp_image_dir}")
        print(f"[TEST DEBUG] IMAGE_DIR env var: {os.getenv('IMAGE_DIR')}")

        # Ensure local plugin is enabled - this will update the plugin's image_dir if needed
        self._ensure_local_plugin_enabled(test_client)

        # Create some test images
        print(f"[TEST DEBUG] Creating test images in {temp_image_dir}")
        create_test_images_set(temp_image_dir, count=3)

        # Verify images were created
        image_files = list(temp_image_dir.glob("test_image_*"))
        print(
            f"[TEST DEBUG] Created {len(image_files)} image files: {[f.name for f in image_files]}"
        )

        # Force plugin to re-scan for images after creating them
        # The plugin's get_images() should call scan_images() automatically,
        # but we'll trigger it explicitly to ensure images are found
        import asyncio

        from app.plugins.manager import plugin_manager

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            plugin = plugin_manager.get_plugin("local-images")
            if not plugin:
                # Plugin not found - this shouldn't happen if _ensure_local_plugin_enabled worked
                raise AssertionError("Local image plugin not found in plugin manager")

            print(f"[TEST DEBUG] Plugin found: {plugin.plugin_id}")
            print(f"[TEST DEBUG] Plugin image_dir BEFORE update: {plugin.image_dir}")
            print(f"[TEST DEBUG] Plugin enabled: {plugin.enabled}, running: {plugin.is_running()}")

            # Update image_dir if it doesn't match (in case plugin was created in previous test)
            current_image_dir = os.getenv("IMAGE_DIR")
            if current_image_dir:
                new_image_dir = Path(current_image_dir).resolve()
                print(f"[TEST DEBUG] IMAGE_DIR env var points to: {new_image_dir}")
                if plugin.image_dir.resolve() != new_image_dir:
                    print(
                        f"[TEST DEBUG] WARNING: Updating plugin image_dir from "
                        f"{plugin.image_dir} to {new_image_dir}"
                    )
                    plugin.image_dir = new_image_dir
                    plugin.image_dir.mkdir(parents=True, exist_ok=True)
                    plugin.thumbnail_dir = plugin.image_dir / "thumbnails"
                    plugin.thumbnail_dir.mkdir(parents=True, exist_ok=True)
                    # Clear the cache when image_dir changes
                    plugin._images = []
                    print("[TEST DEBUG] Cleared plugin _images cache after image_dir change")
                else:
                    print(f"[TEST DEBUG] OK: Plugin image_dir already matches: {plugin.image_dir}")
            else:
                print("[TEST DEBUG] WARNING: IMAGE_DIR env var not set!")

            print(f"[TEST DEBUG] Plugin image_dir AFTER update: {plugin.image_dir}")
            print(f"[TEST DEBUG] Plugin image_dir exists: {plugin.image_dir.exists()}")
            files_list = (
                list(plugin.image_dir.glob("*"))
                if plugin.image_dir.exists()
                else "N/A"
            )
            print(f"[TEST DEBUG] Files in plugin image_dir: {files_list}")

            # Verify images exist in the directory
            image_files_in_dir = list(temp_image_dir.glob("test_image_*"))
            print(f"[TEST DEBUG] Image files in temp_image_dir: {len(image_files_in_dir)}")
            assert (
                len(image_files_in_dir) >= 3
            ), (
                f"Expected at least 3 test images, found {len(image_files_in_dir)} "
                f"in {temp_image_dir}"
            )

            # Force re-scan
            print("[TEST DEBUG] Calling plugin.scan_images()...")
            scanned_images = loop.run_until_complete(plugin.scan_images())
            print(f"[TEST DEBUG] Plugin scanned {len(scanned_images)} images")
            for img in scanned_images:
                filename = img.get("filename")
                img_id = img.get("id")
                img_path = img.get("path")
                print(
                    f"[TEST DEBUG]   - {filename} (id: {img_id}, path: {img_path})"
                )

            assert len(scanned_images) >= 3, (
                f"Plugin scanned {len(scanned_images)} images, expected at least 3. "
                f"Plugin image_dir: {plugin.image_dir}, temp_image_dir: {temp_image_dir}"
            )

            # Also check what get_images() returns
            print("[TEST DEBUG] Calling plugin.get_images()...")
            plugin_images = loop.run_until_complete(plugin.get_images())
            print(f"[TEST DEBUG] Plugin.get_images() returned {len(plugin_images)} images")
        finally:
            loop.close()

        # Get images list via API
        print("[TEST DEBUG] Calling API /api/images/list...")
        response = test_client.get("/api/images/list")

        assert response.status_code == 200
        data = response.json()
        assert "images" in data
        # Should have at least our test images
        assert len(data["images"]) >= 3

    def test_get_current_image(self, test_client, temp_image_dir):
        """Test getting current image."""
        # Ensure local plugin is enabled
        self._ensure_local_plugin_enabled(test_client)

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
        # Ensure local plugin is enabled
        self._ensure_local_plugin_enabled(test_client)

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
        # Ensure local plugin is enabled
        self._ensure_local_plugin_enabled(test_client)

        # Create and upload a test image
        image_data = create_test_image()
        upload_response = test_client.post(
            "/api/images/upload", files={"file": ("test_delete.jpg", image_data, "image/jpeg")}
        )

        if upload_response.status_code == 200:
            image_id = upload_response.json()["image"]["id"]

            # Delete the image
            response = test_client.delete(f"/api/images/{image_id}")
            assert response.status_code == 200

            # Verify it's deleted
            response = test_client.get(f"/api/images/{image_id}")
            assert response.status_code == 404

    def test_next_image(self, test_client, temp_image_dir):
        """Test navigating to next image."""
        # Ensure local plugin is enabled
        self._ensure_local_plugin_enabled(test_client)

        # Create test images
        create_test_images_set(temp_image_dir, count=3)

        # Navigate to next image
        response = test_client.post("/api/images/next")

        assert response.status_code == 200
        data = response.json()
        assert "image" in data

    def test_previous_image(self, test_client, temp_image_dir):
        """Test navigating to previous image."""
        # Ensure local plugin is enabled
        self._ensure_local_plugin_enabled(test_client)

        # Create test images
        create_test_images_set(temp_image_dir, count=3)

        # Navigate to previous image
        response = test_client.post("/api/images/previous")

        assert response.status_code == 200
        data = response.json()
        assert "image" in data
