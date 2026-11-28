// A local server standing in for www.anylist.com (HTTP and websocket), so
// tests run the real anylist-js client without sending AnyList any traffic.
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../anylist-js/lib/index.js', import.meta.url));
export const AnyList = require('./index.js');
const WS = require('ws');

export const pb = new AnyList({ email: 'x', password: 'x' }).protobuf;

/** The multipart part named `name` in a request body, or undefined. */
export function formPart(body, name) {
  const text = body.toString('latin1');
  const start = text.indexOf(`name="${name}"`);
  if (start === -1) return undefined;
  const dataStart = text.indexOf('\r\n\r\n', start) + 4;
  const dataEnd = text.indexOf('\r\n--', dataStart);
  return Buffer.from(text.slice(dataStart, dataEnd), 'latin1');
}

/** An access token whose subject anylist-js reads as the user id. */
function accessToken(uid, n) {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ sub: uid, n })}.sig`;
}

/**
 * Start the stand-in. While it runs, every AnyList instance that logs in talks
 * to it instead of AnyList. `userData` is the PBUserDataResponse fields the
 * sync endpoint returns; `respond(request, res)` may answer a request itself
 * by returning true.
 */
export async function startAnyListStandIn() {
  const standIn = {
    requests: [],
    sockets: [],
    tokensIssued: 0,
    userData: {
      shoppingListsResponse: {
        newLists: [{ identifier: 'groceries', name: 'Groceries', timestamp: 1, items: [] }],
        listResponses: [],
      },
      starterListsResponse: {
        recentItemListsResponse: { listResponses: [] },
        favoriteItemListsResponse: { listResponses: [] },
      },
    },
    respond: null,
    openSockets() {
      return this.sockets.filter((s) => s.readyState === WS.OPEN).length;
    },
  };

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const request = { url: req.url, body: Buffer.concat(chunks) };
      standIn.requests.push(request);
      if (standIn.respond && standIn.respond(request, res)) return;
      if (req.url === '/auth/token') {
        const email = formPart(request.body, 'email').toString();
        standIn.tokensIssued++;
        res.end(JSON.stringify({
          access_token: accessToken(`uid-${email}`, standIn.tokensIssued),
          refresh_token: `refresh-${standIn.tokensIssued}`,
        }));
        return;
      }
      if (req.url === '/data/user-data/get') {
        res.end(new pb.PBUserDataResponse(standIn.userData).toBuffer());
        return;
      }
      res.end('');
    });
  });
  const wss = new WS.Server({ server });
  wss.on('connection', (socket) => {
    standIn.sockets.push(socket);
    socket.on('message', (data) => socket.send(data.toString())); // answer heartbeats
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const host = `127.0.0.1:${server.address().port}`;

  /** Point an AnyList instance at the stand-in. */
  standIn.attach = (anyList) => {
    anyList.authClient = anyList.authClient.extend({ prefixUrl: `http://${host}` });
    anyList.client = anyList.client.extend({ prefixUrl: `http://${host}` });
    anyList._webSocketUrl = `ws://${host}`;
    return anyList;
  };

  const login = AnyList.prototype.login;
  AnyList.prototype.login = function (...args) {
    standIn.attach(this);
    return login.apply(this, args);
  };

  standIn.close = async () => {
    AnyList.prototype.login = login;
    for (const socket of wss.clients) socket.terminate();
    wss.close();
    await new Promise((resolve) => server.close(resolve));
  };

  return standIn;
}
