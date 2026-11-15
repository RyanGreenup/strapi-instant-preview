# Optional preview configuration helper

Status: implemented as the `./server` and `./client` exports; see the
[README](README.md) for the shipped API. Two deliberate departures: the iframe
bridge moved into the package as a framework-agnostic `./client` export (the
host still supplies its router refresh), and `previewHeaders` supplies the
preview response headers. The sections below record the original proposal.

## Decision

Move reusable signed-preview URL mechanics into an optional, server-safe plugin
helper. Keep content routing, document lookup, and authentication policy in the
consumer application. Keep the admin plugin compatible with any Strapi native
preview handler; signed URLs must not become a requirement for using the dock.

A helper can simplify configuration, but it cannot configure the frontend or
choose a consumer's content routes and draft-access policy automatically.

## Current implementation

The working example splits the integration across:

- [Strapi admin configuration](../../apps/strapi-instant-preview-example/config/admin.ts):
  enables native preview, selects supported articles, looks up a draft slug,
  builds a frontend URL, calculates expiry, and signs the URL.
- [Frontend preview utilities](../../apps/web/src/lib/preview.ts): verifies the
  signature and expiry.
- [Frontend CMS client](../../apps/web/src/lib/cms.ts): the only Strapi caller.
  It sends a server-only content API token with every read, and reads a draft
  only for a verified preview. Strapi grants no role content access.
- [Astro preview routes](../../apps/web/src/pages/preview/): render the home
  page, the blog index, and articles, and apply private caching, referrer,
  indexing, and framing policies.
- [Preview bridge](../../apps/web/src/components/PreviewBridge.astro): a thin
  wrapper around the `./client` export. It renders the origin marker and
  supplies the refresh through Astro's client router; the package validates
  parent messages and forwards the iframe-focused toggle shortcut.

## Ownership

| Concern                                                              | Owner                                    |
| -------------------------------------------------------------------- | ---------------------------------------- |
| Signed URL serialization, HMAC, expiry calculation, and verification | Optional server helper                   |
| Strapi native preview configuration wrapper                          | Optional server helper                   |
| Supported content types, document lookup, and frontend route mapping | Host application                         |
| Frontend origin, signing secret, and content API credentials         | Host configuration                       |
| Draft fetching, population, authorization, and rendering             | Frontend integration and host API policy |
| Client-router refresh and iframe shortcut forwarding                 | Frontend integration                     |
| Dock layout, resizing, focus, and admin-side message handling        | Existing admin plugin                    |

## Proposed consumer API

Names and export paths below are illustrative, not a committed package contract.
A `createPreviewConfig` helper would return Strapi's native
`{ enabled, config: { allowedOrigins, handler } }` structure for the `preview`
property in `config/admin.ts`.

```ts
import { createPreviewConfig } from "@ryangreenup/strapi-preview-helpers/server";

// Within the host's existing admin configuration factory:
preview: createPreviewConfig({
  frontendUrl: env("WEB_URL"),
  secret: env("PREVIEW_SECRET"),
  resolvePath: async (uid, { documentId, locale }) => {
    if (uid !== "api::article.article") return undefined;

    const article = await strapi.documents(uid).findOne({
      documentId,
      locale,
      status: "draft",
      fields: ["slug"],
    });

    return article
      ? `/preview/blog/${encodeURIComponent(article.slug || documentId)}`
      : undefined;
  },
}),
```

The callback owns content-specific behavior. Returning no path means no
supported preview URL; the helper must not substitute the frontend root or a
published article page. Missing configuration should fail explicitly, not
generate an unsigned URL.

The helper should derive the allowed frontend origin from `frontendUrl`, build
the URL, carry document identity/locale/status, and sign it. It should not read
application-specific environment variables or depend on a global Strapi
instance. The host supplies the resolver and configuration values explicitly.

Provide matching server-side verification utilities so consumers do not
duplicate the signing contract. Verification returns validated preview
parameters; it does not fetch content or grant API permissions.

## Package boundary

The package currently exports only its admin entry and package metadata. Add an
explicit server-safe utility export, with declarations and the workspace's
ESM/CommonJS conventions. A utility export does not require a Strapi server
plugin entry such as `strapi-server`.

Signing and verification must never enter the browser/admin bundle. The server
entry must not import React, admin components, or browser-only modules.
Consumers using cookies, framework draft sessions, or another authentication
scheme must remain free to supply their own native preview handler.

Do not make the core plugin depend on Astro. Keep framework-specific rendering
and router lifecycle handling in the frontend integration.

## Signed URL contract to preserve

Unless intentionally replaced during implementation, preserve the example's
existing producer/verifier agreement:

- The host resolves a preview pathname; the example uses
  `/preview/blog/${encodeURIComponent(article.slug || documentId)}`.
- Append parameters in order: `documentId`, `locale`, `status`, `expires`. An
  absent locale is the empty string; status is `draft` or `published`.
- Calculate expiry as `(Math.floor(nowSeconds / 3600) + 2) * 3600`, giving 1–2
  hours of access. Clock buckets keep URLs stable between autosaves within a
  bucket; crossing a bucket changes the URL and navigates the iframe.
- Sign `pathname + '?' + searchParams.toString()` using HMAC-SHA256, then append
  its lowercase hexadecimal digest as `signature`.
- Verify the complete path and ordered query with a timing-safe comparison.
  Reject missing, duplicate, malformed, unexpected, tampered, or expired
  parameters before fetching draft content.

Use a dedicated signing secret shared only by the Strapi server and frontend
server. Keep the content API token separate and server-only. Rotating the
signing secret invalidates existing links without rotating the content API
token.

Preview URLs are temporary bearer credentials scoped to the signed document,
locale, status, and path. Redact query strings from access logs. Preserve
`private,no-store`, `no-referrer`, `noindex,nofollow`, and trusted-origin
framing on preview responses. Public pages must continue to read published
content, and public REST requests must not gain draft access.

## Frontend behavior that must not regress

The helper does not replace the iframe protocol:

- Accept `strapiUpdate` only from the configured Strapi parent window and
  origin.
- Refresh through the frontend's client router, preserving the iframe document,
  scroll position, and browser history rather than reloading the document.
- Keep the bridge active across repeated router swaps without accumulating
  listeners; disable its behavior after navigation away from preview pages.
- Forward iframe-focused Ctrl/Command+Alt+P as `strapiPreviewToggle` only to the
  configured admin origin.
- Keep signed URLs out of canonical and Open Graph URL metadata.

## Implementation sequence

1. Define the server helper options and validated preview-parameter types.
   Settle the export path and configuration error behavior before adding
   exports.
2. Extract signing, expiry, and verification into one server-safe
   implementation; preserve the working URL contract and native-handler
   compatibility.
3. Add the native Strapi configuration wrapper around the host-supplied
   resolver.
4. Introduce `PREVIEW_SECRET` in both server environments. Migrate the example
   signer and verifier together; existing signed links will become invalid.
5. Replace duplicated mechanics in the host and frontend with the helpers.
   Retain content lookup, draft authorization, rendering, headers, and the Astro
   router bridge in their current owning applications.
6. Update package setup documentation and verify the real example integration.

## Acceptance criteria

- Consumers can configure signed native preview with a helper call and their own
  content-to-route resolver; unsupported types and unsaved entries show no
  panel.
- Existing custom native preview handlers work without using the helper.
- Server utilities load from built ESM and CommonJS exports, and no signing
  secret or server-only implementation enters the admin/browser bundle.
- Signer/verifier tests cover Unicode and encoded paths, locale/status binding,
  expiry boundaries, stable URLs within a clock bucket, tampering, duplicate and
  unexpected parameters, and signing-secret rotation.
- A saved unpublished article renders through the real frontend preview while
  its unauthenticated public page remains unavailable.
- Repeated autosaves refresh an unchanged URL through the client router without
  losing editor focus, scroll position, or adding history entries. A changed
  slug navigates to the new URL.
- The iframe-focused shortcut works after repeated router swaps. Public draft
  REST requests remain blocked, and invalid preview links fail before draft
  fetching.

## Out of scope

Automatic content-route discovery, automatic frontend installation, a mandatory
signed-URL protocol, new framework adapters, and changing the existing dock UI.
