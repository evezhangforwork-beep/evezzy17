# Free public deployment

The public edition deploys through GitHub Pages and requires no paid service, payment method, database, or server.

## Deploy

1. Push the repository to the `main` branch on GitHub.
2. Enable GitHub Pages with GitHub Actions as the publishing source.
3. The `Deploy free web edition` workflow builds and publishes the site.
4. Open `https://<account>.github.io/<repository>/draw/`.

## Public-mode behavior

- Card draws happen entirely in the visitor's browser with Web Crypto randomness. The question does not participate in card selection.
- The copy-reading action works without an account or external API.
- Each visitor's reading history is stored in that visitor's browser. It is not uploaded, shared with other visitors, or synchronized across devices.
- The existing server-side reading history remains limited to loopback hosts (`localhost` and `127.0.0.1`).

The optional `render.yaml` remains available for a full hosted MCP/HTTP server, but Render can require payment information even for a free-plan service.

## License notices

The application code and bundled card artwork are MIT-licensed. Keep the repository `LICENSE` and `assets/ASSET_LICENSE.md` notices when redistributing or publishing modified copies.
