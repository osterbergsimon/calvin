# Share links: let guests add photos

A share link lets someone add photos to Calvin from their phone without the
admin password. Each link only adds photos to **one folder** in Local photos.
It can't open Settings, see your other photos or touch the machine Calvin runs
on, and you can turn it off at any time.

## Create a link

1. Open **Settings › Content › Photos** and find **Share links**.
2. Tap **Create link**.
3. Fill in:
   - **Name**: who it is for ("Grandma"), so you know which link to revoke.
   - **Folder in Local photos**: where the photos land. Calvin creates the
     folder if it doesn't exist (default `Guests`).
   - **Link works for**: until you revoke it, or 1 day, 1 week or 30 days.
   - **Photo limit**: how many photos the link takes in total (default 500).
     Each link also stops at 2 GB of photos; the API takes `max_mb` to change
     that.
4. Tap **Create**. A QR code and the link's address appear.

Scan the QR code with the guest's phone, or send them the address. You can
show the QR code again at any time with **Show QR**, and **Rename** a link
without changing its address.

The list shows each link's folder, when it was created and last used, and how
many photos came in through it.

Only folders made for share links are part of Local photos: Calvin marks them
with a hidden `.calvin-share` file. Other subfolders you keep in the photos
folder (an archive, backups) stay out of the slideshow, as before. Pick a
folder of your own as a link's folder only if you want its photos on show.

## What the guest sees

A page with one big **Add photos** button. It opens the phone's photo picker
(several photos at once is fine), shows progress while sending, and then
the photos sent from that phone as thumbnails. The guest can remove their own
photos, and only those: another phone using the same link can't see or remove
them.

Calvin scales each photo down for display (longest side 2560 px), turns it
upright and removes the GPS location from its EXIF data. Only JPEG, PNG, WebP
and GIF images are accepted, up to 25 MB each. Animated GIFs are written again
too, at most 200 frames and 1280 px on the longest side.

**There is no moderation.** A guest's photo goes on the display as soon as it
arrives; nobody approves it first. Give links only to people you trust with
your screen, and remove a photo you don't want from Settings › Content ›
Photos › Manage images (or revoke the link with its photos).

## Install it on Android (share from the gallery)

1. Open the link in **Chrome** on the phone.
2. Tap **Install on this phone** on the page, or Chrome's **⋮ › Add to Home
   screen › Install**.
3. From now on, in Google Photos or the gallery: pick photos › **Share** ›
   **Calvin photos**. The photos are sent and the page confirms how many were
   added.

## iPhone and iPad

Open the link in Safari and tap **Share › Add to Home Screen**. The icon opens
the page with its **Add photos** button. iOS doesn't let web apps appear in the
Share menu, so sharing from the Photos app isn't available there.

## Revoke a link

Tap **Revoke** next to the link. It stops working immediately: the guest page
says the link no longer works, and uploads are refused. Photos already sent
stay in Local photos unless you turn on **Also remove the photos sent with
this link** (only that link's photos go; anything else in the folder stays).

## Security notes

- The link's address **is** the key. Anyone who has it can add photos to that
  folder (nothing else) until it is revoked or runs out. Give each person their
  own link, and revoke a link you no longer need.
- Calvin stores only a hash of each link's secret in `share-links.json` next to
  `admin-auth.json` in the data directory. `share-links.key` sits in the same
  directory and lets Calvin show the address again, so **anyone who can read
  the data directory can work out every link's address**: the hash protects
  the links file on its own, not a copy of the whole directory. Keep the data
  directory private (both files are mode 0600) and revoke every link if a copy
  leaks. Deleting both files revokes every link. Links are not part of a
  backup.
- The secret part of the address is removed from Calvin's logs. A reverse
  proxy in front of Calvin keeps its own access log, which **does** record the
  full address: turn that log off for these paths, or treat the log file as
  secret.
- Wrong addresses are slowed down: a few wrong tries lock that device out of
  further wrong tries for a while. A working link is never locked out. Behind
  a reverse proxy every guest seems to come from the proxy, so set
  `CALVIN_TRUSTED_PROXIES` to the proxy's address; Calvin then counts each
  guest by the `X-Forwarded-For` address the proxy sends.
- Each link accepts at most 100 photos per 10 minutes from one device, its
  photo limit and 2 GB in total. Calvin refuses guest photos when less than
  512 MB of disk space is left.
- One upload request may be at most 256 MB; larger requests are refused before
  Calvin reads them. A request from another website to the share target is
  refused.

### On your home network

This is the expected setup: the guest's phone must be on the same Wi-Fi as
Calvin. Nothing else is needed.

### From the internet (only if you expose Calvin)

A guest away from home can only reach the link if you make Calvin reachable
from the internet (a reverse proxy, a tunnel or port forwarding) and set
`PUBLIC_URL` so the QR code uses that address. Know the risk before you do:

- Calvin's dashboard and its read-only API need no login on your home network.
  Exposed as a whole, **anyone on the internet could see your calendars and
  photos**. Expose only the paths a guest needs: `/share/`, `/api/guest/`,
  `/assets/`, `/sw.js`, `/favicon.svg`, `/icon-192.png`, `/icon-512.png` and
  `/apple-touch-icon.png`. For example, with Caddy:

  ```
  photos.example.com {
    @guest path /share/* /api/guest/* /assets/* /sw.js /favicon.svg /icon-*.png /apple-touch-icon.png
    handle @guest {
      # Refuse oversized uploads at the proxy (Calvin's own cap is 256 MB).
      request_body {
        max_size 256MB
      }
      reverse_proxy calvin.local:8000
    }
    respond 404
  }
  ```

  and start Calvin with `CALVIN_TRUSTED_PROXIES` set to the proxy's address
  (for Caddy on the same machine: `127.0.0.1`).

- Use HTTPS (the share target and home-screen install need it off the home
  network anyway).
- Give exposed links an expiry, and revoke them when the event is over.

## For developers

- Store: `backend/app/security/share_links.py`
- Routes: `backend/app/api/routes/share.py`; the guest routes are listed in
  `GUEST_ROUTES` in `backend/app/security/route_policy.py`.
  `backend/app/security/guest_gate.py` (pure ASGI middleware) resolves the
  token, caps the body and refuses a cross-site share target before any body
  is read; the route policy repeats the token check for an app without it.
- The service worker (`frontend/public/sw.js`) leaves `/share/*` and
  `/api/guest/*` alone, so no share-link page or token URL is cached.
- Photo checks: `backend/app/services/guest_image.py`
- Guest page: `frontend/src/views/GuestShare.vue`; admin list:
  `ShareLinksSection.vue` in Settings › Content.
