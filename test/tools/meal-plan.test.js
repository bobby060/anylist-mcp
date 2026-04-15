import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../../src/tools/meal-plan.js';
import { MockAnyListClient, createMockServer } from './helpers.js';

describe('meal_plan tool', () => {
  let client;
  let handlers;

  beforeEach(() => {
    client = new MockAnyListClient();
    const { server, handlers: h } = createMockServer();
    register(server, () => Promise.resolve(client));
    handlers = h;
  });

  describe('list_events', () => {
    it('returns empty message when no events', async () => {
      const result = await handlers.meal_plan({ action: 'list_events' });
      assert.ok(result.content[0].text.includes('No meal plan events'));
    });

    it('lists events sorted by date', async () => {
      client._events.push(
        { date: '2025-02-10', title: 'Tacos', identifier: 'e1' },
        { date: '2025-02-08', title: 'Pizza', identifier: 'e2' },
      );
      const result = await handlers.meal_plan({ action: 'list_events' });
      const t = result.content[0].text;
      assert.ok(t.indexOf('2025-02-08') < t.indexOf('2025-02-10'));
    });

    it('includes event identifier in output', async () => {
      client._events.push({ date: '2025-03-01', title: 'Sushi', identifier: 'e-abc' });
      const result = await handlers.meal_plan({ action: 'list_events' });
      assert.ok(result.content[0].text.includes('e-abc'));
    });

    it('filters events by start_date', async () => {
      client._events.push(
        { date: '2025-04-01', title: 'Early', identifier: 'e-early' },
        { date: '2025-04-10', title: 'Mid', identifier: 'e-mid' },
        { date: '2025-04-20', title: 'Late', identifier: 'e-late' },
      );
      const result = await handlers.meal_plan({ action: 'list_events', start_date: '2025-04-10' });
      const t = result.content[0].text;
      assert.ok(!t.includes('2025-04-01'), 'event before start_date should be excluded');
      assert.ok(t.includes('2025-04-10'), 'event on start_date should be included');
      assert.ok(t.includes('2025-04-20'), 'event after start_date should be included');
    });

    it('filters events by end_date', async () => {
      client._events.push(
        { date: '2025-05-01', title: 'Early', identifier: 'f-early' },
        { date: '2025-05-10', title: 'Mid', identifier: 'f-mid' },
        { date: '2025-05-20', title: 'Late', identifier: 'f-late' },
      );
      const result = await handlers.meal_plan({ action: 'list_events', end_date: '2025-05-10' });
      const t = result.content[0].text;
      assert.ok(t.includes('2025-05-01'), 'event before end_date should be included');
      assert.ok(t.includes('2025-05-10'), 'event on end_date should be included');
      assert.ok(!t.includes('2025-05-20'), 'event after end_date should be excluded');
    });

    it('filters events by start_date and end_date range', async () => {
      client._events.push(
        { date: '2025-06-01', title: 'Before', identifier: 'g-before' },
        { date: '2025-06-05', title: 'InRange', identifier: 'g-in' },
        { date: '2025-06-10', title: 'After', identifier: 'g-after' },
      );
      const result = await handlers.meal_plan({ action: 'list_events', start_date: '2025-06-03', end_date: '2025-06-07' });
      const t = result.content[0].text;
      assert.ok(!t.includes('2025-06-01'), 'event before range should be excluded');
      assert.ok(t.includes('2025-06-05'), 'event in range should be included');
      assert.ok(!t.includes('2025-06-10'), 'event after range should be excluded');
    });

    it('returns empty message when date filter excludes all events', async () => {
      client._events.push({ date: '2025-07-15', title: 'Lonely', identifier: 'h-lonely' });
      const result = await handlers.meal_plan({ action: 'list_events', start_date: '2025-08-01' });
      assert.ok(result.content[0].text.includes('No meal plan events'));
    });
  });

  describe('list_labels', () => {
    it('returns empty message when no labels', async () => {
      const result = await handlers.meal_plan({ action: 'list_labels' });
      assert.ok(result.content[0].text.includes('No meal plan labels'));
    });

    it('lists labels with ids', async () => {
      client._labels.push({ identifier: 'l1', name: 'Dinner', hexColor: '#FF0000' });
      const result = await handlers.meal_plan({ action: 'list_labels' });
      assert.ok(result.content[0].text.includes('Dinner'));
      assert.ok(result.content[0].text.includes('l1'));
    });
  });

  describe('create_event', () => {
    it('creates an event', async () => {
      const result = await handlers.meal_plan({ action: 'create_event', date: '2025-03-01' });
      assert.ok(result.content[0].text.includes('Created meal plan event'));
      assert.equal(client._events.length, 1);
    });
  });

  describe('delete_event', () => {
    it('deletes an existing event', async () => {
      client._events.push({ identifier: 'e1', date: '2025-03-01' });
      const result = await handlers.meal_plan({ action: 'delete_event', event_id: 'e1' });
      assert.ok(result.content[0].text.includes('Deleted meal plan event'));
    });

    it('returns error for non-existent event', async () => {
      const result = await handlers.meal_plan({ action: 'delete_event', event_id: 'bad' });
      assert.equal(result.isError, true);
    });
  });
});
