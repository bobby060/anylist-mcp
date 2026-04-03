import { z } from "zod";
import { textResponse, errorResponse } from "./helpers.js";
import { createElicitationHelpers } from "./elicitation.js";

export function register(server, getClient) {
  const { elicitRequiredField } = createElicitationHelpers(server);

  server.registerTool("meal_plan", {
    title: "Meal Plan",
    description: `Manage AnyList meal planning calendar. Actions:
- list_events: Show all meal plan events (sorted by date)
- list_labels: Show available labels (Breakfast, Lunch, Dinner, etc.) with IDs
- create_event: Add a meal plan event for a date
- delete_event: Delete a meal plan event by ID`,
    inputSchema: {
      action: z.enum(["list_events", "list_labels", "create_event", "delete_event"]).describe("The meal plan action to perform"),
      date: z.string().optional().describe("Date in YYYY-MM-DD format (required for create_event)"),
      title: z.string().optional().describe("Event title (create_event; use this OR recipe_id)"),
      recipe_id: z.string().optional().describe("Recipe ID to link (create_event)"),
      label_id: z.string().optional().describe("Label ID for meal type (create_event)"),
      details: z.string().optional().describe("Additional notes (create_event)"),
      event_id: z.string().optional().describe("Event ID to delete (required for delete_event)"),
    }
  }, async (params) => {
    const { action, date, title, recipe_id, label_id, details, event_id } = params;
    try {
      const client = await getClient();
      await client.connect(null);
      switch (action) {
        case "list_events": {
          const events = await client.getMealPlanEvents();
          if (events.length === 0) return textResponse("No meal plan events found.");
          events.sort((a, b) => a.date.localeCompare(b.date));
          const list = events.map(e => {
            const parts = [`- **${e.date}**`];
            if (e.title) parts.push(e.title);
            if (e.recipeName) parts.push(`📖 ${e.recipeName}`);
            if (e.labelName) parts.push(`[${e.labelName}]`);
            if (e.details) parts.push(`— ${e.details}`);
            return parts.join(' ');
          }).join('\n');
          return textResponse(`Meal Plan (${events.length} events):\n${list}`);
        }
        case "list_labels": {
          const labels = await client.getMealPlanLabels();
          if (labels.length === 0) return textResponse("No meal plan labels found.");
          const list = labels.map(l => `- **${l.name}** (${l.hexColor || 'no color'}) — id: ${l.identifier}`).join('\n');
          return textResponse(`Meal Plan Labels:\n${list}`);
        }
        case "create_event": {
          let eventDate = date;
          if (!eventDate) eventDate = await elicitRequiredField("date", "What date for the meal plan event? (YYYY-MM-DD)");
          const result = await client.createMealPlanEvent({
            date: eventDate,
            title: title || null,
            recipeId: recipe_id || null,
            labelId: label_id || null,
            details: details || null,
          });
          return textResponse(`Created meal plan event for ${result.date}`);
        }
        case "delete_event": {
          let eventId = event_id;
          if (!eventId) eventId = await elicitRequiredField("event_id", "Which event ID should be deleted?");
          await client.deleteMealPlanEvent(eventId);
          return textResponse(`Deleted meal plan event ${eventId}`);
        }
      }
    } catch (error) {
      return errorResponse(`Meal plan ${action} failed: ${error.message}`);
    }
  });
}
