# Free public deployment

This repository includes a Render Blueprint in `render.yaml` for a free Docker web service.

## Deploy

1. Push this repository to a GitHub repository you control.
2. In Render, create a new Blueprint and select that repository.
3. Confirm the `midnight-tarot-draw` free web service.
4. Open the generated Render URL. `/` redirects to `/draw/`.

The Singapore region is selected for lower latency in Asia. Render's free web services can sleep while idle, so the first visit after a quiet period may take longer to load.

## Public-mode behavior

- Card draws and the copy-reading action work on the public page.
- Each visitor's reading history is stored in that visitor's browser on public domains. It is not uploaded, shared with other visitors, or synchronized across devices.
- The existing server-side reading history remains limited to loopback hosts (`localhost` and `127.0.0.1`).
- The free deployment does not include persistent storage. Service restarts can discard in-progress server sessions.

## License notices

The application code and bundled card artwork are MIT-licensed. Keep the repository `LICENSE` and `assets/ASSET_LICENSE.md` notices when redistributing or publishing modified copies.
