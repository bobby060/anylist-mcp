import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AnyListClient from '../src/anylist-client.js';
import { AnyList, startAnyListStandIn } from './anylist-stand-in.js';

const waitFor = async (condition) => {
  const deadline = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('AnyListClient against a stand-in AnyList', () => {
  let standIn;
  before(async () => { standIn = await startAnyListStandIn(); });
  after(() => standIn.close());

  const newClient = () => new AnyListClient({
    username: 'a@example.com',
    password: 'pw',
    defaultListName: 'Groceries',
    storageDir: mkdtempSync(path.join(tmpdir(), 'anylist-client-test-')),
  });

  // A client already signed in, without saved files.
  const signedInClient = () => {
    const anyList = standIn.attach(new AnyList({ email: 'x', password: 'x', credentialsFile: null, userDataFile: null }));
    anyList.clientId = 'test-client';
    anyList.accessToken = 'test-token';
    const client = newClient();
    client.client = anyList;
    return client;
  };

  it('shares one sign-in between concurrent first calls', async () => {
    standIn.tokensIssued = 0;
    standIn.sockets = [];
    const client = newClient();

    await Promise.all([client.connect(), client.login(), client.connect()]);

    assert.equal(standIn.tokensIssued, 1);
    assert.equal(standIn.sockets.length, 1);
    await client.disconnect();
    await waitFor(() => standIn.openSockets() === 0);
  });

  it('closes a sign-in that finishes after disconnect', async () => {
    standIn.sockets = [];
    const client = newClient();

    const signingIn = client.login();
    await client.disconnect();
    await signingIn;

    assert.equal(client.client, null);
    await waitFor(() => standIn.openSockets() === 0);
  });

  it('reports a failed update to an existing item', async () => {
    standIn.userData.shoppingListsResponse.newLists[0].items = [
      { identifier: 'milk', listId: 'groceries', name: 'Milk', checked: false },
    ];
    standIn.respond = (request, res) => {
      if (request.url !== '/data/shopping-lists/update') return false;
      res.statusCode = 500;
      res.end();
      return true;
    };
    const client = signedInClient();
    await client.connect();

    try {
      await assert.rejects(() => client.addItem('Milk', 2), /Failed to add item "Milk"/);
    } finally {
      standIn.respond = null;
      standIn.userData.shoppingListsResponse.newLists[0].items = [];
    }
  });

  it("reports a meal plan event's own day east of UTC+12", async () => {
    const tz = process.env.TZ;
    process.env.TZ = 'Pacific/Auckland'; // UTC+13 in January
    standIn.userData.mealPlanningCalendarResponse = {
      calendarId: 'calendar',
      responseVersion: 1,
      events: [{ identifier: 'e-1', calendarId: 'calendar', date: '2026-01-15', title: 'Soup' }],
    };
    try {
      const [event] = await signedInClient().getMealPlanEvents();
      assert.equal(event.date, '2026-01-15');
    } finally {
      if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
      delete standIn.userData.mealPlanningCalendarResponse;
    }
  });
});
