import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { AnyListService } from '../services/anylist-service.js';
import {
  CreateMealEventSchema,
  GetMealEventsSchema,
} from '../utils/validation.js';

/**
 * Register meal planning tools with FastMCP
 */
export function registerMealTools(server: FastMCP, anylistService: AnyListService) {
  // Get all meal events
  server.addTool({
    name: 'get_meal_events',
    description: 'Retrieve all meal planning events from AnyList with optional filtering',
    parameters: GetMealEventsSchema,
    execute: async ({ startDate, endDate, includeRecipes = true }) => {
      const events = await anylistService.getMealEvents(startDate, endDate);
      
      if (events.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No meal events found for the specified date range.',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${events.length} meal events:\n\n${events
              .map(
                (event) =>
                  `**${event.title}** (${event.date.toISOString().split('T')[0]})\n` +
                  `  ID: ${event.identifier}\n` +
                  `  Type: ${event.mealType || 'Not specified'}\n` +
                  (event.note ? `  Note: ${event.note}\n` : '') +
                  (event.recipeId && includeRecipes ? `  Recipe ID: ${event.recipeId}\n` : '')
              )
              .join('\n')}`,
          },
        ],
      };
    },
  });

  // Get meal events by specific date
  server.addTool({
    name: 'get_meal_events_by_date',
    description: 'Get meal events for a specific date',
    parameters: z.object({
      date: z.string().describe('Date to get meal events for (ISO date string)'),
    }),
    execute: async ({ date }) => {
      const events = await anylistService.getMealEvents(date, date);
      
      if (events.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No meal events found for ${date}.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Meal events for ${date}:\n\n${events
              .map(
                (event) =>
                  `**${event.title}**\n` +
                  `  Type: ${event.mealType || 'Not specified'}\n` +
                  (event.note ? `  Note: ${event.note}\n` : '') +
                  (event.recipeId ? `  Recipe ID: ${event.recipeId}\n` : '')
              )
              .join('\n')}`,
          },
        ],
      };
    },
  });

  // Create a new meal event
  server.addTool({
    name: 'create_meal_event',
    description: 'Create a new meal planning event',
    parameters: CreateMealEventSchema,
    execute: async (request) => {
      const event = await anylistService.createMealEvent(request);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully created meal event "${event.title}" for ${event.date.toISOString().split('T')[0]}${
              event.recipeId ? ` with recipe ID: ${event.recipeId}` : ''
            }`,
          },
        ],
      };
    },
  });

  // Update an existing meal event
  server.addTool({
    name: 'update_meal_event',
    description: 'Update an existing meal planning event',
    parameters: z.object({
      eventId: z.string().describe('The ID of the meal event to update'),
      title: z.string().optional().describe('New title for the meal event'),
      date: z.string().optional().describe('New date for the meal event (ISO date string)'),
      details: z.string().optional().describe('New details for the meal event'),
      recipeId: z.string().optional().describe('New recipe ID to assign'),
      recipeScaleFactor: z.number().optional().describe('New recipe scale factor'),
    }),
    execute: async ({ eventId, ...updates }) => {
      // Get the current event to preserve existing data
      const currentEvent = await anylistService.getMealEvent(eventId);
      if (!currentEvent) {
        throw new Error(`Meal event with ID ${eventId} not found`);
      }

      // Create updated event with merged data
      const mergedData = {
        title: updates.title || currentEvent.title || 'Meal Event',
        date: updates.date || currentEvent.date.toISOString().split('T')[0],
        details: updates.details !== undefined ? updates.details : currentEvent.details,
        recipeId: updates.recipeId !== undefined ? updates.recipeId : currentEvent.recipeId,
        recipeScaleFactor: updates.recipeScaleFactor !== undefined ? updates.recipeScaleFactor : currentEvent.recipeScaleFactor,
      };
      
      const updatedEvent = await anylistService.createMealEvent(mergedData);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully updated meal event "${updatedEvent.title}" for ${updatedEvent.date.toISOString().split('T')[0]}`,
          },
        ],
      };
    },
  });

  // Delete a meal event
  server.addTool({
    name: 'delete_meal_event',
    description: 'Delete a meal planning event',
    parameters: z.object({
      eventId: z.string().describe('The ID of the meal event to delete'),
    }),
    execute: async ({ eventId }) => {
      await anylistService.deleteMealEvent(eventId);
      return {
        content: [
          {
            type: 'text',
            text: 'Successfully deleted meal event',
          },
        ],
      };
    },
  });

  // Assign recipe to meal event
  server.addTool({
    name: 'assign_recipe_to_meal',
    description: 'Assign a recipe to an existing meal event',
    parameters: z.object({
      eventId: z.string().describe('The ID of the meal event'),
      recipeId: z.string().describe('The ID of the recipe to assign'),
    }),
    execute: async ({ eventId, recipeId }) => {
      // Get the current event to preserve other details
      const currentEvent = await anylistService.getMealEvent(eventId);
      if (!currentEvent) {
        throw new Error(`Meal event with ID ${eventId} not found`);
      }

      // Update the event with the recipe
      const updatedEvent = await anylistService.createMealEvent({
        title: currentEvent.title || 'Meal Event',
        date: currentEvent.date.toISOString().split('T')[0],
        details: currentEvent.note,
        recipeId,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Successfully assigned recipe to meal event "${updatedEvent.title}"`,
          },
        ],
      };
    },
  });

  // Get weekly meal plan
  server.addTool({
    name: 'get_weekly_meal_plan',
    description: 'Get meal plan for a week starting from the specified date',
    parameters: z.object({
      startDate: z.string().describe('Start date of the week (ISO date string)'),
    }),
    execute: async ({ startDate }) => {
      const start = new Date(startDate);
      const end = new Date(start);
      end.setDate(start.getDate() + 6); // 7 days total
      
      const events = await anylistService.getMealEvents(
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0]
      );

      // Group events by date
      const eventsByDate: Record<string, typeof events> = {};
      events.forEach((event) => {
        const dateKey = event.date.toISOString().split('T')[0];
        if (!eventsByDate[dateKey]) {
          eventsByDate[dateKey] = [];
        }
        eventsByDate[dateKey].push(event);
      });

      // Generate week view
      const weekDays = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const dateKey = date.toISOString().split('T')[0];
        const dayEvents = eventsByDate[dateKey] || [];
        
        weekDays.push(
          `**${date.toLocaleDateString('en-US', { weekday: 'long' })} (${dateKey})**\n` +
          (dayEvents.length > 0
            ? dayEvents.map((event) => `  - ${event.title}${event.mealType ? ` (${event.mealType})` : ''}`).join('\n')
            : '  - No meals planned')
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Weekly meal plan (${startDate} to ${end.toISOString().split('T')[0]}):\n\n${weekDays.join('\n\n')}`,
          },
        ],
      };
    },
  });

  // Get monthly meal plan
  server.addTool({
    name: 'get_monthly_meal_plan',
    description: 'Get meal plan for a specific month',
    parameters: z.object({
      month: z.string().describe('Month in YYYY-MM format'),
    }),
    execute: async ({ month }) => {
      const [year, monthNum] = month.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0); // Last day of month
      
      const events = await anylistService.getMealEvents(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

      // Group events by date
      const eventsByDate: Record<string, typeof events> = {};
      events.forEach((event) => {
        const dateKey = event.date.toISOString().split('T')[0];
        if (!eventsByDate[dateKey]) {
          eventsByDate[dateKey] = [];
        }
        eventsByDate[dateKey].push(event);
      });

      // Generate calendar view
      const monthName = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const daysInMonth = endDate.getDate();
      const calendarDays = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthNum - 1, day);
        const dateKey = date.toISOString().split('T')[0];
        const dayEvents = eventsByDate[dateKey] || [];
        
        calendarDays.push(
          `**${day}** (${date.toLocaleDateString('en-US', { weekday: 'short' })})\n` +
          (dayEvents.length > 0
            ? dayEvents.map((event) => `  • ${event.title}${event.mealType ? ` (${event.mealType})` : ''}`).join('\n')
            : '  • No meals planned')
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: `Monthly meal plan for ${monthName}:\n\n${calendarDays.join('\n\n')}`,
          },
        ],
      };
    },
  });

  // Get meal events by meal type
  server.addTool({
    name: 'get_meal_events_by_type',
    description: 'Filter meal events by meal type (breakfast, lunch, dinner, snack)',
    parameters: z.object({
      mealType: z.string().describe('Type of meal to filter by'),
      startDate: z.string().optional().describe('Start date for filtering (ISO date string)'),
      endDate: z.string().optional().describe('End date for filtering (ISO date string)'),
    }),
    execute: async ({ mealType, startDate, endDate }) => {
      const events = await anylistService.getMealEvents(startDate, endDate);
      
      // Filter by meal type (checking both mealType field and title)
      const filteredEvents = events.filter(event => 
        event.mealType?.toLowerCase().includes(mealType.toLowerCase()) ||
        event.title?.toLowerCase().includes(mealType.toLowerCase())
      );

      if (filteredEvents.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No ${mealType} meals found for the specified date range.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${filteredEvents.length} ${mealType} meals:\n\n${filteredEvents
              .map(
                (event) =>
                  `**${event.title}** (${event.date.toISOString().split('T')[0]})\n` +
                  `  ID: ${event.identifier}\n` +
                  (event.note ? `  Note: ${event.note}\n` : '') +
                  (event.recipeId ? `  Recipe ID: ${event.recipeId}\n` : '')
              )
              .join('\n')}`,
          },
        ],
      };
    },
  });

  // Bulk create meal events
  server.addTool({
    name: 'bulk_create_meal_events',
    description: 'Create multiple meal events at once',
    parameters: z.object({
      events: z.array(CreateMealEventSchema).describe('Array of meal events to create'),
    }),
    execute: async ({ events }) => {
      const createdEvents = [];
      const errors = [];

      for (const eventData of events) {
        try {
          const event = await anylistService.createMealEvent(eventData);
          createdEvents.push(event);
        } catch (error) {
          errors.push({
            event: eventData,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const successText = createdEvents.length > 0 
        ? `Successfully created ${createdEvents.length} meal events:\n${createdEvents
          .map(event => `• ${event.title} (${event.date.toISOString().split('T')[0]})`)
          .join('\n')}`
        : '';

      const errorText = errors.length > 0 
        ? `\n\nFailed to create ${errors.length} events:\n${errors
          .map(({ event, error }) => `• ${event.title}: ${error}`)
          .join('\n')}`
        : '';

      return {
        content: [
          {
            type: 'text',
            text: successText + errorText,
          },
        ],
      };
    },
  });

  // Get meal event details
  server.addTool({
    name: 'get_meal_event_details',
    description: 'Get detailed information about a specific meal event',
    parameters: z.object({
      eventId: z.string().describe('The ID of the meal event to get details for'),
    }),
    execute: async ({ eventId }) => {
      const event = await anylistService.getMealEvent(eventId);
      if (!event) {
        return {
          content: [
            {
              type: 'text',
              text: `Meal event with ID ${eventId} not found.`,
            },
          ],
        };
      }

      let recipeDetails = '';
      if (event.recipeId) {
        try {
          const recipe = await anylistService.getRecipe(event.recipeId);
          recipeDetails = '\n\n**Recipe Details:**\n' +
            `• Name: ${recipe.name}\n` +
            `• Servings: ${recipe.servings || 'Not specified'}\n` +
            `• Prep Time: ${recipe.prepTime ? Math.round(recipe.prepTime / 60) + ' minutes' : 'Not specified'}\n` +
            `• Cook Time: ${recipe.cookTime ? Math.round(recipe.cookTime / 60) + ' minutes' : 'Not specified'}\n` +
            `• Rating: ${recipe.rating ? recipe.rating + '/5' : 'Not rated'}\n` +
            `• Ingredients: ${recipe.ingredients.length} items\n` +
            `• Instructions: ${recipe.instructions.length} steps`;
        } catch (error) {
          recipeDetails = '\n\n**Recipe Details:** Unable to load recipe details';
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: '**Meal Event Details:**\n\n' +
              `• **Title:** ${event.title}\n` +
              `• **Date:** ${event.date.toISOString().split('T')[0]}\n` +
              `• **ID:** ${event.identifier}\n` +
              `• **Meal Type:** ${event.mealType || 'Not specified'}\n` +
              `• **Note:** ${event.note || 'None'}\n` +
              `• **Recipe ID:** ${event.recipeId || 'None'}\n` +
              `• **Recipe Scale Factor:** ${event.recipeScaleFactor || 1}x\n` +
              recipeDetails,
          },
        ],
      };
    },
  });

  // Suggest recipes for meal event
  server.addTool({
    name: 'suggest_recipes_for_meal',
    description: 'Get recipe suggestions based on meal type and preferences',
    parameters: z.object({
      mealType: z.string().describe('Type of meal (breakfast, lunch, dinner, snack)'),
      maxResults: z.number().optional().default(5).describe('Maximum number of suggestions to return'),
      searchTerm: z.string().optional().describe('Optional search term to filter recipes'),
    }),
    execute: async ({ mealType, maxResults = 5, searchTerm }) => {
      const recipes = await anylistService.getRecipes();
      
      // Filter recipes based on meal type and search term
      let filteredRecipes = recipes.filter(recipe => {
        const nameMatch = recipe.name.toLowerCase().includes(mealType.toLowerCase());
        const noteMatch = recipe.note?.toLowerCase().includes(mealType.toLowerCase()) || false;
        const searchMatch = searchTerm ? 
          recipe.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          recipe.note?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          recipe.ingredients.some(ing => ing.name.toLowerCase().includes(searchTerm.toLowerCase()))
          : true;
        
        return (nameMatch || noteMatch) && searchMatch;
      });

      // Sort by rating (highest first) and limit results
      filteredRecipes = filteredRecipes
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, maxResults);

      if (filteredRecipes.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No recipes found for ${mealType}${searchTerm ? ` matching "${searchTerm}"` : ''}.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Recipe suggestions for ${mealType}:\n\n${filteredRecipes
              .map(recipe => 
                `**${recipe.name}** (ID: ${recipe.identifier})\n` +
                `  • Rating: ${recipe.rating ? recipe.rating + '/5' : 'Not rated'}\n` +
                `  • Prep Time: ${recipe.prepTime ? Math.round(recipe.prepTime / 60) + ' minutes' : 'Not specified'}\n` +
                `  • Cook Time: ${recipe.cookTime ? Math.round(recipe.cookTime / 60) + ' minutes' : 'Not specified'}\n` +
                `  • Servings: ${recipe.servings || 'Not specified'}\n` +
                (recipe.note ? `  • Note: ${recipe.note}\n` : '')
              )
              .join('\n')}`,
          },
        ],
      };
    },
  });

  // Clear meal events for date range
  server.addTool({
    name: 'clear_meal_events',
    description: 'Clear all meal events for a specific date or date range',
    parameters: z.object({
      startDate: z.string().describe('Start date (ISO date string)'),
      endDate: z.string().optional().describe('End date (ISO date string). If not provided, only clears events for startDate'),
    }),
    execute: async ({ startDate, endDate }) => {
      const events = await anylistService.getMealEvents(startDate, endDate || startDate);
      
      if (events.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No meal events found for the specified date range.',
            },
          ],
        };
      }

      const deletedEvents = [];
      const errors = [];

      for (const event of events) {
        try {
          await anylistService.deleteMealEvent(event.identifier);
          deletedEvents.push(event);
        } catch (error) {
          errors.push({
            event,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const successText = deletedEvents.length > 0 
        ? `Successfully deleted ${deletedEvents.length} meal events:\n${deletedEvents
          .map(event => `• ${event.title} (${event.date.toISOString().split('T')[0]})`)
          .join('\n')}`
        : '';

      const errorText = errors.length > 0 
        ? `\n\nFailed to delete ${errors.length} events:\n${errors
          .map(({ event, error }) => `• ${event.title}: ${error}`)
          .join('\n')}`
        : '';

      return {
        content: [
          {
            type: 'text',
            text: successText + errorText,
          },
        ],
      };
    },
  });
} 