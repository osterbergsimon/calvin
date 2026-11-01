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
4. Tap **Create link**. A QR code and the link's address appear.

Scan the QR code with the guest's phone, or send them the address. You can
show the QR code again at any time with **Show QR**, and **Rename** a link
without changing its address.

The list shows each link's folder, when it was created and last used, and how
many photos came in through it.

## What the guest sees

A page with one big **Add photos** button. It opens the phone's photo picker
(several photos at once is fine), shows progress while sending, and then
the photos sent from that phone as thumbnails. The guest can remove their own
photos, and only those: another phone using the same link can't see or remove
them.

Calvin scales each photo down for display (longest side 2560 px), turns it
upright and removes the GPS location from its EXIF data. Only JPEG, PNG, WebP
and GIF images are accepted, up to 25 MB each.

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
stay in Local photos unless you tick **Also remove the photos sent with this
link** (only that link's photos go; anything else in the folder stays).

## Security notes

- The link's address **is** the key. Anyone who has it can add photos to that
  folder (nothing else) until it is revoked or runs out. Give each person their
  own link, and revoke a link you no longer need.
- Calvin stores only a hash of each link's secret in `share-links.json` next to
  `admin-auth.json` in the data directory; `share-links.key` (also private to
  Calvin) lets Calvin show the address again. Deleting both files revokes every
  link. Links are not part of a backup.
- The secret part of the address is removed from Calvin's logs.
- Guessing addresses is slowed down (a few wrong tries lock that device out for
  a while), and each link accepts at most 100 photos per 10 minutes from one
  device.

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
      reverse_proxy calvin.local:8000
    }
    respond 404
  }
  ```

- Use HTTPS (the share target and home-screen install need it off the home
  network anyway).
- Give exposed links an expiry, and revoke them when the event is over.

## For developers

- Store: `backend/app/security/share_links.py`
- Routes: `backend/app/api/routes/share.py`; the guest routes are listed in
  `GUEST_ROUTES` in `backend/app/security/route_policy.py`, which resolves the
  token before any handler runs.
- Photo checks: `backend/app/services/guest_image.py`
- Guest page: `frontend/src/views/GuestShare.vue`; admin list:
  `ShareLinksSection.vue` in Settings › Content.
