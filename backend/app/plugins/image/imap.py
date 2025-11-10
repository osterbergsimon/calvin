"""IMAP email image plugin."""

import asyncio
import email
import imaplib
from datetime import datetime
from email.header import decode_header
from pathlib import Path
from typing import Any

from PIL import Image

from app.plugins.protocols import ImagePlugin


class ImapImagePlugin(ImagePlugin):
    """IMAP email image plugin for downloading images from email attachments."""

    def __init__(
        self,
        plugin_id: str,
        name: str,
        email_address: str,
        email_password: str,
        imap_server: str = "imap.gmail.com",
        imap_port: int = 993,
        image_dir: Path | str | None = None,
        check_interval: int = 300,  # Check every 5 minutes
        mark_as_read: bool = True,
        enabled: bool = True,
    ):
        """
        Initialize IMAP image plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name
            email_address: Email address to check
            email_password: Email password or app-specific password
            imap_server: IMAP server address (default: imap.gmail.com)
            imap_port: IMAP server port (default: 993 for SSL)
            image_dir: Directory to save downloaded images (defaults to local images dir)
            check_interval: How often to check for new emails (seconds, default: 300)
            mark_as_read: Whether to mark processed emails as read (default: True)
            enabled: Whether the plugin is enabled
        """
        super().__init__(plugin_id, name, enabled)
        self.email_address = email_address
        self.email_password = email_password
        self.imap_server = imap_server
        self.imap_port = imap_port
        self.image_dir = Path(image_dir) if image_dir else Path("./data/images")
        self.image_dir.mkdir(parents=True, exist_ok=True)
        self.check_interval = check_interval
        self.mark_as_read = mark_as_read
        self.thumbnail_size = (200, 200)
        self.supported_formats = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
        self._images: list[dict[str, Any]] = []
        self._processed_emails: set[str] = set()  # Track processed email UIDs
        self._check_task: asyncio.Task | None = None
        self._running = False

    async def initialize(self) -> None:
        """Initialize the plugin."""
        # Scan existing images
        await self.scan_images()
        # Start checking for new emails
        if self.enabled:
            self._running = True
            self._check_task = asyncio.create_task(self._check_emails_loop())

    async def cleanup(self) -> None:
        """Cleanup plugin resources."""
        self._running = False
        if self._check_task:
            self._check_task.cancel()
            try:
                await self._check_task
            except asyncio.CancelledError:
                pass

    async def _check_emails_loop(self) -> None:
        """Background loop to check for new emails."""
        while self._running:
            try:
                await self._check_emails()
                await asyncio.sleep(self.check_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error in IMAP email check loop: {e}")
                await asyncio.sleep(self.check_interval)

    async def _check_emails(self) -> None:
        """Check for new emails with image attachments."""
        try:
            # Run IMAP operations in thread pool (imaplib is synchronous)
            images_downloaded = await asyncio.to_thread(self._check_emails_sync)
            # Rescan images if any were downloaded
            if images_downloaded:
                await self.scan_images()
        except Exception as e:
            print(f"Error checking emails: {e}")

    async def fetch_now(self) -> dict[str, Any]:
        """
        Manually trigger email check and return result.
        
        Returns:
            Dictionary with success status, message, and number of images downloaded
        """
        try:
            # Run IMAP operations in thread pool (imaplib is synchronous)
            images_downloaded = await asyncio.to_thread(self._check_emails_sync)
            
            # Always rescan images to get accurate count
            print(f"[IMAP] Rescanning images after fetch...")
            scanned_images = await self.scan_images()
            image_count = len(self._images)
            print(f"[IMAP] Scan complete. Found {image_count} images in {self.image_dir}")
            
            if images_downloaded:
                return {
                    "success": True,
                    "message": f"Successfully checked for new emails. {image_count} images available.",
                    "images_downloaded": True,
                    "image_count": image_count,
                }
            else:
                return {
                    "success": True,
                    "message": f"No new emails with image attachments found. {image_count} images available.",
                    "images_downloaded": False,
                    "image_count": image_count,
                }
        except Exception as e:
            error_msg = str(e)
            if "authentication failed" in error_msg.lower() or "invalid credentials" in error_msg.lower():
                return {
                    "success": False,
                    "message": "Authentication failed. Please check your email address and password.",
                    "images_downloaded": False,
                    "image_count": len(self._images),
                }
            elif "connection refused" in error_msg.lower() or "timeout" in error_msg.lower():
                return {
                    "success": False,
                    "message": f"Could not connect to {self.imap_server}. Please check the server address and port.",
                    "images_downloaded": False,
                    "image_count": len(self._images),
                }
            else:
                return {
                    "success": False,
                    "message": f"Error checking emails: {error_msg}",
                    "images_downloaded": False,
                    "image_count": len(self._images),
                }

    def _check_emails_sync(self) -> bool:
        """Synchronous email checking (runs in thread pool).
        
        Returns:
            True if any images were downloaded, False otherwise
        """
        images_downloaded = False
        try:
            # Connect to IMAP server
            mail = imaplib.IMAP4_SSL(self.imap_server, self.imap_port)
            mail.login(self.email_address, self.email_password)
            mail.select("INBOX")

            # Search for unread emails
            status, messages = mail.search(None, "UNSEEN")
            if status != "OK":
                mail.close()
                mail.logout()
                return False

            email_ids = messages[0].split()
            if not email_ids:
                mail.close()
                mail.logout()
                return False

            # Process each email
            for email_id in email_ids:
                try:
                    # Fetch email
                    status, msg_data = mail.fetch(email_id, "(RFC822)")
                    if status != "OK":
                        continue

                    email_body = msg_data[0][1]
                    email_message = email.message_from_bytes(email_body)

                    # Check if we've already processed this email
                    email_uid = email_id.decode()
                    if email_uid in self._processed_emails:
                        continue

                    # Extract image attachments
                    email_images_downloaded = self._extract_images(email_message)

                    if email_images_downloaded:
                        # Mark email as processed
                        self._processed_emails.add(email_uid)
                        if self.mark_as_read:
                            mail.store(email_id, "+FLAGS", "\\Seen")
                        images_downloaded = True

                except Exception as e:
                    print(f"Error processing email {email_id}: {e}")
                    continue

            mail.close()
            mail.logout()
            return images_downloaded

        except Exception as e:
            print(f"Error connecting to IMAP server: {e}")
            return False

    def _extract_images(self, email_message: email.message.Message) -> bool:
        """Extract image attachments from email message."""
        images_downloaded = False

        for part in email_message.walk():
            content_disposition = str(part.get("Content-Disposition", ""))
            content_type = part.get_content_type()

            # Check if this is an image attachment
            if "attachment" in content_disposition or (
                content_type.startswith("image/") and part.get_filename()
            ):
                filename = part.get_filename()
                if not filename:
                    continue

                # Decode filename if needed
                decoded_filename = self._decode_filename(filename)
                if not decoded_filename:
                    continue

                # Check if it's a supported image format
                file_ext = Path(decoded_filename).suffix.lower()
                if file_ext not in self.supported_formats:
                    continue

                try:
                    # Download image
                    image_data = part.get_payload(decode=True)
                    if not image_data:
                        continue

                    # Save image
                    image_path = self.image_dir / decoded_filename
                    # Avoid overwriting existing files
                    counter = 1
                    while image_path.exists():
                        stem = Path(decoded_filename).stem
                        image_path = self.image_dir / f"{stem}_{counter}{file_ext}"
                        counter += 1

                    with open(image_path, "wb") as f:
                        f.write(image_data)

                    # Generate thumbnail
                    self._generate_thumbnail(image_path)

                    images_downloaded = True
                    print(f"Downloaded image from email: {image_path}")

                except Exception as e:
                    print(f"Error downloading image {decoded_filename}: {e}")
                    continue

        return images_downloaded

    def _decode_filename(self, filename: str) -> str | None:
        """Decode email filename."""
        try:
            decoded_parts = decode_header(filename)
            decoded_string = ""
            for part, encoding in decoded_parts:
                if isinstance(part, bytes):
                    if encoding:
                        decoded_string += part.decode(encoding)
                    else:
                        decoded_string += part.decode("utf-8", errors="ignore")
                else:
                    decoded_string += part
            return decoded_string
        except Exception:
            return filename

    def _generate_thumbnail(self, image_path: Path) -> None:
        """Generate thumbnail for image."""
        try:
            thumbnail_dir = self.image_dir / "thumbnails"
            thumbnail_dir.mkdir(parents=True, exist_ok=True)

            thumbnail_path = thumbnail_dir / f"{image_path.stem}_thumb.jpg"

            # Open and resize image
            with Image.open(image_path) as img:
                img.thumbnail(self.thumbnail_size, Image.Resampling.LANCZOS)
                # Convert to RGB if needed (for JPEG)
                if img.mode in ("RGBA", "P"):
                    rgb_img = Image.new("RGB", img.size, (255, 255, 255))
                    rgb_img.paste(img, mask=img.split()[3] if img.mode == "RGBA" else None)
                    img = rgb_img
                img.save(thumbnail_path, "JPEG", quality=85)
        except Exception as e:
            print(f"Error generating thumbnail for {image_path}: {e}")

    async def get_images(self) -> list[dict[str, Any]]:
        """
        Get list of all available images.

        Returns:
            List of image metadata dictionaries
        """
        await self.scan_images()
        return self._images.copy()

    async def get_image(self, image_id: str) -> dict[str, Any] | None:
        """
        Get image metadata by ID.

        Args:
            image_id: Image identifier

        Returns:
            Image metadata dictionary or None if not found
        """
        await self.scan_images()
        for img in self._images:
            if img["id"] == image_id:
                return img.copy()
        return None

    async def get_image_data(self, image_id: str) -> bytes | None:
        """
        Get image file data by ID.

        Args:
            image_id: Image identifier

        Returns:
            Image file data as bytes or None if not found
        """
        img = await self.get_image(image_id)
        if not img:
            return None

        try:
            with open(img["path"], "rb") as f:
                return f.read()
        except Exception as e:
            print(f"Error reading image file {img['path']}: {e}")
            return None

    async def scan_images(self) -> list[dict[str, Any]]:
        """
        Scan for images in the image directory.

        Returns:
            List of image metadata dictionaries
        """
        images = []
        
        print(f"[IMAP] Scanning images in directory: {self.image_dir}")
        print(f"[IMAP] Directory exists: {self.image_dir.exists()}")

        for image_path in self.image_dir.glob("*"):
            if not image_path.is_file():
                print(f"[IMAP] Skipping non-file: {image_path}")
                continue

            file_ext = image_path.suffix.lower()
            if file_ext not in self.supported_formats:
                print(f"[IMAP] Skipping unsupported format: {image_path} (ext: {file_ext})")
                continue

            try:
                # Get image metadata
                with Image.open(image_path) as img:
                    width, height = img.size
                    format_name = img.format or "JPEG"

                # Get file size
                file_size = image_path.stat().st_size

                # Generate image ID
                image_id = f"{self.plugin_id}-{image_path.stem}"

                image_metadata = {
                    "id": image_id,
                    "filename": image_path.name,
                    "path": str(image_path),
                    "width": width,
                    "height": height,
                    "size": file_size,
                    "format": format_name.lower(),
                    "source": self.plugin_id,
                    "title": image_path.stem,
                }
                images.append(image_metadata)
                print(f"[IMAP] Found image: {image_path.name} (id: {image_id})")

            except Exception as e:
                print(f"[IMAP] Error scanning image {image_path}: {e}")
                import traceback
                traceback.print_exc()
                continue

        print(f"[IMAP] Scan complete. Found {len(images)} images")
        self._images = images
        return images

    async def validate_config(self, config: dict[str, Any]) -> bool:
        """Validate plugin configuration."""
        required_fields = ["email_address", "email_password"]
        for field in required_fields:
            if field not in config or not config[field]:
                return False
        return True

    async def configure(self, config: dict[str, Any]) -> None:
        """Configure the plugin with new settings."""
        await super().configure(config)

        if "email_address" in config:
            self.email_address = config["email_address"]
        if "email_password" in config:
            self.email_password = config["email_password"]
        if "imap_server" in config:
            self.imap_server = config["imap_server"]
        if "imap_port" in config:
            self.imap_port = int(config["imap_port"])
        if "image_dir" in config:
            self.image_dir = Path(config["image_dir"])
            self.image_dir.mkdir(parents=True, exist_ok=True)
        if "check_interval" in config:
            self.check_interval = int(config["check_interval"])
        if "mark_as_read" in config:
            self.mark_as_read = bool(config["mark_as_read"])

        # Restart email checking if settings changed
        if self._check_task:
            self._check_task.cancel()
        if self.enabled:
            self._running = True
            self._check_task = asyncio.create_task(self._check_emails_loop())

