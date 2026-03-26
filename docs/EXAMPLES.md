# AnyList MCP Server - Usage Examples

This document provides practical examples of using the AnyList MCP Server with Claude Desktop, covering common workflows and advanced use cases.

## Table of Contents

- [Basic Setup Examples](#basic-setup-examples)
- [Authentication Examples](#authentication-examples)
- [List Management Examples](#list-management-examples)
- [Recipe Management Examples](#recipe-management-examples)
- [Meal Planning Examples](#meal-planning-examples)
- [Bulk Operations Examples](#bulk-operations-examples)
- [Advanced Workflows](#advanced-workflows)
- [Integration Patterns](#integration-patterns)

## Basic Setup Examples

### Quick Setup for Claude Desktop

**Claude Desktop Configuration:**
```json
{
  "mcpServers": {
    "anylist": {
      "command": "npx",
      "args": ["-y", "anylist-mcp"],
      "env": {
        "ANYLIST_EMAIL": "your-email@example.com",
        "ANYLIST_PASSWORD": "your-password"
      }
    }
  }
}
```

**First Test:**
```
# In Claude Desktop
Check my AnyList authentication status
Show me all my AnyList lists
```

### Development Setup

**Local Development Configuration:**
```json
{
  "mcpServers": {
    "anylist": {
      "command": "npx",
      "args": ["tsx", "/Users/yourname/anylist-mcp/src/index.ts"],
      "env": {
        "ANYLIST_CREDENTIALS_FILE": "/Users/yourname/.anylist_credentials",
        "DEBUG": "anylist-mcp*",
        "NODE_ENV": "development"
      }
    }
  }
}
```

## Authentication Examples

### Setting Up Credentials

**Using Claude Desktop tools:**
```
Set my AnyList credentials: email "user@example.com", password "mypassword", save to file true
```

**Checking authentication status:**
```
Check my AnyList authentication status
```

**Expected response:**
```json
{
  "isAuthenticated": true,
  "configSource": "credentials_file",
  "hasEnvironmentVars": false,
  "hasCredentialsFile": true,
  "credentialsFileExists": true,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Managing Credentials

**Get credentials file information:**
```
Get information about my AnyList credentials file
```

**Fix file permissions:**
```
Fix the permissions on my AnyList credentials file
```

**Clear credentials:**
```
Clear my AnyList credentials and remove the credentials file
```

## List Management Examples

### Basic List Operations

**View all lists:**
```
Show me all my AnyList lists
```

**Expected response:**
```
Found 3 lists:

**Groceries** (ID: abc123)
  Items: 8
  - ○ milk
  - ○ bread
  - ✓ eggs
  - ○ apples
  - ○ cheese

**Hardware Store** (ID: def456)
  Items: 3
  - ○ screws
  - ○ paint
  - ○ brushes

**Party Supplies** (ID: ghi789)
  Items: 5
  - ✓ balloons
  - ○ cake
  ... and 3 more items
```

**Create a new list:**
```
Create a new list called "Weekly Groceries"
```

**Expected response:**
```
Successfully created list "Weekly Groceries" with ID: jkl012
```

### Adding Items to Lists

**Add single item:**
```
Add "milk" to my Groceries list
```

**Add item with quantity:**
```
Add "2 lbs ground beef" to my Weekly Groceries list
```

**Add item with details:**
```
Add "bread" with details "whole grain, organic" to my Groceries list
```

**Add multiple items with natural language:**
```
Add milk, eggs, bread, and cheese to my Groceries list
```

### Managing Items

**Check off items:**
```
Check off "milk" from my Groceries list
Mark "eggs" as purchased in my Groceries list
```

**Update item details:**
```
Update "milk" in my Groceries list to have quantity "1 gallon"
Change the quantity of "ground beef" to "3 lbs" in my Weekly Groceries list
```

**Remove items:**
```
Remove "bread" from my Groceries list
Delete "apples" from my Weekly Groceries list
```

**Toggle item status:**
```
Toggle the status of "cheese" in my Groceries list
Switch the checked status of "milk"
```

### List Maintenance

**Uncheck all items:**
```
Uncheck all items in my Groceries list
Reset all checked items in my Weekly Groceries list
```

**Get detailed list information:**
```
Show me detailed information about my Groceries list
Get details for my Weekly Groceries list
```

**Expected detailed response:**
```
**Groceries** (ID: abc123)
Total items: 8
Checked items: 3
Unchecked items: 5

**Unchecked Items:**
- milk (1 gallon)
- bread - whole grain, organic
- apples
- cheese
- butter

**Checked Items:**
- ✓ eggs (1 dozen)
- ✓ tomatoes (2 lbs)
- ✓ yogurt
```

## Recipe Management Examples

### Basic Recipe Operations

**View all recipes:**
```
Show me all my recipes
Find all my pasta recipes
```

**Search for specific recipes:**
```
Find recipes containing "chicken"
Search for "chocolate" recipes
Show me recipes with "pasta" in the name
```

**Get specific recipe:**
```
Show me the details for my lasagna recipe
Get recipe with ID "recipe123"
```

**Expected recipe response:**
```
# Chicken Lasagna

**Recipe ID:** recipe123
**Servings:** 8
**Prep Time:** 30m
**Cook Time:** 1h 15m
**Rating:** 5/5
**Source:** Family Recipe

## Ingredients:
- 1 lb lasagna noodles
- 2 lbs ground chicken
- 2 cups ricotta cheese
- 2 cups mozzarella cheese, shredded
- 1/2 cup parmesan cheese, grated
- 2 cups marinara sauce
- 2 eggs
- 2 tbsp olive oil
- 1 onion, diced
- 3 cloves garlic, minced

## Instructions:
1. Preheat oven to 375°F
2. Cook lasagna noodles according to package directions
3. In a large skillet, heat olive oil and cook onion and garlic
4. Add ground chicken and cook until browned
5. Add marinara sauce and simmer for 10 minutes
6. In a bowl, mix ricotta, eggs, and half the mozzarella
7. Layer noodles, meat sauce, and cheese mixture in baking dish
8. Top with remaining mozzarella and parmesan
9. Bake for 45 minutes until golden and bubbly
10. Let rest for 10 minutes before serving

**Notes:** Can be made ahead and frozen. Increase cooking time if cooking from frozen.
```

### Creating Recipes

**Simple recipe creation:**
```
Create a new recipe for chocolate chip cookies with ingredients: 2 cups flour, 1 cup sugar, 1/2 cup butter, 2 eggs, 1 cup chocolate chips. Instructions: Mix dry ingredients, cream butter and sugar, add eggs, combine all ingredients, bake at 350°F for 12 minutes.
```

**Detailed recipe creation:**
```
Create a recipe called "Spaghetti Carbonara" with 4 servings, 15 minute prep time, 20 minute cook time. Ingredients: 1 lb spaghetti, 6 oz pancetta diced, 3 large eggs, 1 cup pecorino romano grated, 2 cloves garlic minced, black pepper, salt. Instructions: Cook pasta, crisp pancetta, whisk eggs with cheese, combine hot pasta with pancetta, add egg mixture off heat, toss quickly, season with pepper.
```

### Advanced Recipe Management

**Update existing recipe:**
```
Update my chocolate chip cookies recipe to add a note about using room temperature butter
Change the cook time for my lasagna recipe to 1 hour
Add a rating of 5 stars to my carbonara recipe
```

**Import recipe from URL:**
```
Import a recipe from https://example.com/best-chocolate-cake
Import recipe from this URL and name it "Mom's Chocolate Cake"
```

**Delete recipe:**
```
Delete my old meatloaf recipe
Remove the recipe for "Failed Soufflé"
```

## Meal Planning Examples

### Basic Meal Planning

**View meal events:**
```
Show me all my meal events
What meals do I have planned for this week?
Get meal events for today
```

**View specific date:**
```
What meals do I have planned for January 15th?
Show me meals for tomorrow
Get meal events for next Friday
```

**Expected meal planning response:**
```
Found 5 meal events:

**Taco Tuesday** (2024-01-15)
  ID: event123
  Type: dinner
  Recipe ID: recipe456

**Family BBQ** (2024-01-16)
  ID: event124
  Type: lunch
  Note: Remember to buy charcoal

**Date Night** (2024-01-17)
  ID: event125
  Type: dinner
  Recipe ID: recipe789

**Sunday Brunch** (2024-01-18)
  ID: event126
  Type: brunch
  Note: Invite Sarah and Mike

**Meal Prep Sunday** (2024-01-19)
  ID: event127
  Type: lunch
  Recipe ID: recipe234
```

### Creating Meal Events

**Simple meal event:**
```
Schedule "Taco Tuesday" for next Tuesday
Create a dinner event for tonight called "Pizza Night"
```

**Meal event with recipe:**
```
Schedule "Family Dinner" for this Saturday and assign my lasagna recipe
Create a meal event for tomorrow dinner using my chicken curry recipe
```

**Detailed meal event:**
```
Create a meal event called "Anniversary Dinner" for January 20th with my beef wellington recipe and a note to "set romantic atmosphere"
```

### Weekly Meal Planning

**Get weekly overview:**
```
Show me my meal plan for this week
Get the weekly meal plan starting Monday
What's planned for the week of January 15th?
```

**Plan a full week:**
```
Plan my meals for next week:
- Monday: Chicken stir fry
- Tuesday: Taco Tuesday with my taco recipe
- Wednesday: Leftover night
- Thursday: Spaghetti carbonara
- Friday: Pizza delivery
- Saturday: BBQ with friends
- Sunday: Meal prep with my curry recipe
```

## Bulk Operations Examples

### Bulk List Management

**Add multiple items:**
```
Add these items to my grocery list: milk, bread, eggs, cheese, apples, bananas, yogurt, chicken breast
```

**Bulk add with quantities:**
```
Add to my grocery list: "2 gallons milk", "1 loaf bread", "1 dozen eggs", "1 lb cheddar cheese"
```

**Mark multiple items as checked:**
```
Mark these items as purchased: milk, bread, eggs
Check off: apples, bananas, yogurt from my grocery list
```

**Remove multiple items:**
```
Remove these items from my grocery list: old milk, expired yogurt, moldy bread
Delete these checked items: eggs, cheese, butter
```

### Bulk Recipe Operations

**Import multiple recipes:**
```
Import recipes from these URLs:
- https://example.com/chicken-curry
- https://example.com/beef-stew
- https://example.com/vegetable-soup
```

**Create multiple meal events:**
```
Create these meal events for next week:
- Monday dinner: Chicken curry
- Wednesday dinner: Beef stew  
- Friday dinner: Vegetable soup
- Sunday lunch: Family BBQ
```

## Advanced Workflows

### Grocery Shopping Workflow

**1. Plan the week:**
```
Show me my meal plan for this week
What recipes am I making this week?
```

**2. Generate shopping list:**
```
Create a new list called "Weekly Shopping - Jan 15"
Based on my meal plan, add ingredients for my planned recipes to the shopping list
```

**3. Add additional items:**
```
Add these staples to my shopping list: milk, bread, eggs, fruits, vegetables
Add household items: paper towels, dish soap, laundry detergent
```

**4. Organize for shopping:**
```
Show me detailed information about my Weekly Shopping list
How many items do I need to buy?
```

**5. While shopping:**
```
Check off "milk" from my shopping list
Mark "bread" as purchased
Toggle the status of "eggs"
```

**6. After shopping:**
```
Show me what items are still unchecked on my shopping list
Did I get everything on my list?
```

### Recipe Development Workflow

**1. Find inspiration:**
```
Show me all my pasta recipes
Find recipes containing "tomato"
Search for recipes with cooking time less than 30 minutes
```

**2. Create new recipe:**
```
Create a new recipe called "Quick Pasta Primavera" with 4 servings, 10 minute prep, 15 minute cook time
```

**3. Test and refine:**
```
Update my Quick Pasta Primavera recipe to add a note about using fresh vegetables
Change the cook time to 12 minutes
Add a rating of 4 stars
```

**4. Plan to make it:**
```
Schedule "Pasta Night" for tomorrow using my Quick Pasta Primavera recipe
Add ingredients for Pasta Primavera to my grocery list
```

### Meal Prep Workflow

**1. Plan prep session:**
```
Create a meal event for Sunday called "Meal Prep Session"
What recipes are good for meal prep?
```

**2. Choose recipes:**
```
Show me my curry recipes
Get details for my chicken curry recipe
Show me my soup recipes
```

**3. Calculate quantities:**
```
Create a meal prep list for making 5 portions of chicken curry
Add ingredients for double batch of vegetable soup
```

**4. Schedule meals:**
```
Create meal events for the week using my prepped meals:
- Monday lunch: Chicken curry (meal prep)
- Tuesday lunch: Vegetable soup (meal prep)
- Wednesday lunch: Chicken curry (meal prep)
- Thursday lunch: Vegetable soup (meal prep)
```

### Party Planning Workflow

**1. Plan the menu:**
```
Show me my appetizer recipes
Find recipes that serve 8 or more people
Get my lasagna recipe details
```

**2. Create shopping list:**
```
Create a new list called "Birthday Party Shopping"
Add ingredients for party lasagna (double recipe) to the party shopping list
Add party supplies: plates, napkins, decorations
```

**3. Schedule preparation:**
```
Create meal events for party prep:
- Friday: Make lasagna (prep day)
- Saturday: Set up and party day
```

**4. Track preparation:**
```
Add "prep vegetables" to my party shopping list
Add "buy flowers" to my party shopping list
Check off completed prep tasks
```

## Integration Patterns

### With Other Planning Tools

**Morning routine:**
```
Check my AnyList authentication status
What meals do I have planned for today?
Do I need to add anything to my grocery list for today's meals?
Show me my current grocery list
```

**Weekly planning:**
```
Show me my meal plan for next week
What ingredients do I need for next week's meals?
Create a shopping list for next week
Check what items I already have at home
```

### With Cooking Workflows

**Before cooking:**
```
Get details for tonight's recipe
Do I have all ingredients for my chicken curry recipe?
What's the prep time for tonight's meal?
```

**While cooking:**
```
Show me the instructions for my lasagna recipe
What temperature should I bake this at?
How long does this need to cook?
```

**After cooking:**
```
Update my chicken curry recipe with notes about adjusting spice level
Rate my lasagna recipe 5 stars
Add a note about doubling the recipe next time
```

### Error Handling Examples

**Common error scenarios:**

**Invalid list ID:**
```
Add "milk" to list "nonexistent123"
# Response: List with ID "nonexistent123" not found
```

**Missing required parameters:**
```
Create a new list
# Response: Validation error - Name is required
```

**Authentication issues:**
```
Show me my lists
# Response: Authentication failed. Please check credentials.
```

**Network issues:**
```
Get my recipes
# Response: Connection timeout. Please check your internet connection.
```

### Performance Optimization

**Batch operations:**
```
# Instead of multiple individual calls:
Add "milk" to my list
Add "bread" to my list  
Add "eggs" to my list

# Use bulk operations:
Add these items to my grocery list: milk, bread, eggs
```

**Efficient querying:**
```
# Get overview first:
Show me all my AnyList lists

# Then get details for specific lists:
Show me detailed information about my grocery list
```

These examples demonstrate the full range of capabilities available with the AnyList MCP Server. Start with basic operations and gradually incorporate more advanced workflows as you become comfortable with the system.