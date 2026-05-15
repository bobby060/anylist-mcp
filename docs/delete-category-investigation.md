# AnyList custom-category-delete investigation findings

Date: 2026-05-15. Investigated against rkjarve@me.com / Grocery List on
the macOS AnyList.app + bobby060/anylist-mcp + bobby060/anylist-js submodule.

## Summary

**The server-side delete-category functionality works.** The AnyList macOS app
successfully deletes custom categories. But the JS lib (`anylist-js`, both the
existing Rust-mirroring code and every plausible variant I tested) cannot
delete via the documented HTTPS POST path. **Conclusion: the mac/iOS apps use
a different sync channel for category mutations.**

## Evidence

### Step 1: Sweep of HTTPS POST payload shapes

I tested 8 variants of `PBListOperation` against the live API
(`https://www.anylist.com/data/shopping-lists/update-v2`):

| handler                  | originalValue | originalCategory       | endpoint              | opClass | result                                  |
| ------------------------ | ------------- | ---------------------- | --------------------- | ------- | --------------------------------------- |
| `remove-category`        | yes           | no                     | `/update-v2` (Rust ref) | 3       | 200 OK; category survives server-side   |
| `remove-category`        | yes           | yes (full PBListCategory) | `/update-v2`          | 3       | 200 OK; category survives               |
| `remove-category`        | no            | yes                    | `/update-v2`          | 3       | 200 OK; category survives               |
| `delete-category`        | yes           | yes                    | `/update-v2`          | 3       | 200 OK; category survives               |
| `remove-category`        | yes           | no                     | `/update` (legacy v1) | 3       | 200 OK; category survives               |
| `remove-list-category`   | yes           | yes                    | `/update-v2`          | 3       | 200 OK; category survives               |
| `remove-category`        | yes           | no                     | `/update-v2`          | 0       | 200 OK; category survives               |
| `remove-category-by-id`  | yes           | no                     | `/update-v2`          | 3       | 200 OK; category survives               |

Every variant returns success and is silently dropped. `phildenhoff/anylist_rs`'s
`delete_category` matches variant #1 and also doesn't work (it appears never to
have been runtime-verified for delete; only create + rename are demonstrated in
its docs example).

### Step 2: mitmproxy capture of the Mac app deleting a category

Setup:
- mitmproxy 12.2.3 listening on 127.0.0.1:8080
- mitmproxy CA cert installed in `/Library/Keychains/System.keychain` and trusted at root level
- macOS HTTPS proxy configured on the Wi-Fi service to 127.0.0.1:8080
- AnyList.app restarted under the proxy so all new connections route through mitmproxy

While the proxy was active, in the AnyList Mac app I navigated:
*Item → its category dropdown → Edit Categories (bottom right) → delete a custom category*.

Mac app behavior: the category disappeared from the UI. Verified via
the MCP `list_categories` tool that the category was also gone server-side
(count went from 42 to 41).

mitmproxy capture during that interaction shows:

```
16:59:26  POST /auth/token/refresh             200
16:59:30  GET  /web/mac?system_locale=en_US    200
16:59:30  GET  /data/account/info              200
16:59:30  POST /data/user-data/get             200    (initial full sync, 775 KB)
16:59:31  POST /auth/token/refresh             200
17:00:10  POST /auth/token/refresh             200
17:01:28  POST /auth/token/refresh             200
```

**No POST to `/data/shopping-lists/update*`. No WebSocket flow on
`www.anylist.com`. Zero mutation traffic captured.**

The auth/read traffic clearly traverses mitmproxy (we see it decrypted with
our CA), so the proxy + cert trust are working. The delete request goes via
a path that ignores macOS system proxy.

### Step 3: What channel is being bypassed?

The JS lib opens exactly one WebSocket: `wss://www.anylist.com/data/add-user-listener`,
in `_setupWebSocket()` (anylist-js/lib/index.js:277). The lib only RECEIVES
on this WS (for server-pushed updates); it sends all mutations via the got HTTP
client, hence `client.post('data/shopping-lists/update-v2', ...)`.

**Hypothesis:** the macOS / iOS native clients send category mutations as
outbound WebSocket frames on `/data/add-user-listener` (or a sibling path),
which the JS lib does not implement. Outbound WS sends would explain:
- Why server-side delete works (the server has a working handler).
- Why every HTTPS POST shape we try is silently dropped (the HTTPS handler may
  literally not be wired for `remove-category` and just acks all ops).
- Why mitmproxy didn't see the mutation: macOS's `Network.framework` /
  `NSURLSessionWebSocketTask` connections do not always honor the system
  HTTPS proxy. The auth/read calls use `NSURLSession` HTTP which does honor
  proxy; the WS does not.

This is consistent with the JS lib's create-category and rename-category
working (they're newer code paths in `anylist-js`, both verified working in
this session); the server-side handler exists for create/rename via HTTPS but
not for remove via HTTPS.

## Recommended next steps for the maintainer

1. **Confirm the WebSocket-mutation hypothesis** with a transparent proxy
   (pf-rule redirect of all 443 outbound to mitmproxy in transparent mode).
   This catches connections that ignore the proxy env variables.

   Alternative: tcpdump the actual interface during a Mac-app delete and
   correlate destination IPs against known AnyList endpoints to see whether
   any non-HTTPS traffic is happening.

2. **Inspect the WebSocket frame format.** Once captured, decode with the
   existing `PBListOperation` protobuf or look for a different message type
   (perhaps `PBWebSocketMessage` or similar) that wraps ops for the WS channel.

3. **Implement a WS-mutation path in `anylist-js`.** If the hypothesis is right,
   add a `_postViaWebSocket(op)` that wraps the same `PBListOperation` and
   sends it as a binary WS frame on the existing `add-user-listener` socket.

4. **Until that lands**, the user-visible behavior should be: `delete_category`
   in the MCP tool throws a clear error referencing this limitation, instructing
   the user to delete custom categories in the AnyList iOS / Mac app.

## What this session shipped

In `bobby060/anylist-js` (submodule):

- `lib/index.js`: `getLists()` now merges `modifiedLists[] + newLists[]`,
  fixing an unrelated bug where long-lived clients on this account got an
  empty list set from `user-data/get` and nothing worked.
- `lib/list.js`: `removeCategory` retains the Rust-mirroring single-attempt
  implementation, with a `KNOWN BUG` comment block summarizing this finding.

In `bobby060/anylist-mcp`:

- `src/anylist-client.js` `deleteCategory`: posts, then re-fetches from the
  server, throws a clear error if the category is still present. No silent
  false-success (this is what Bobby reported in PR #34).
- `src/tools/categories.js`: tool description for `delete_category` calls out
  the known issue and tells the agent / user to delete in the native app for
  now.
