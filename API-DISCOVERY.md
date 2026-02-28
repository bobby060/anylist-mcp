# AnyList API Discovery

Analysis of the protobuf schema (`anylist-js/lib/definitions.json`) vs what's implemented in anylist-js and exposed via MCP.

## What's Covered by anylist-js

### Shopping Lists
- `ShoppingList`, `ListItem` — full CRUD (create, read, update, delete items)
- `PBListOperation` / `PBListOperationList` — list mutation operations
- Category mapping via `PBListCategoryGroup` → `PBListCategory`

### Recipes
- `PBRecipe`, `PBIngredient` — full CRUD
- `PBRecipeOperation` / `PBRecipeOperationList` — recipe mutations
- `PBRecipeCollection` — create, delete, add/remove recipes

### Meal Planning
- `PBCalendarEvent`, `PBCalendarLabel` — full CRUD
- `PBCalendarOperation` / `PBCalendarOperationList` — calendar mutations

### Starter Lists (Favorites & Recents)
- `StarterList` — read favorites and recent items per list
- `PBStarterListOperation` — add/remove favorite items

### Auth & Connection
- Token management (fetch, refresh, store encrypted)
- WebSocket real-time updates (`refresh-shopping-lists`)

## What's in the Protobuf but NOT Used by anylist-js

### User & Account Management
| Message | Description |
|---------|-------------|
| `User` | Full user profile (firstName, lastName, isPremiumUser, recipeDataId, facebookUserId, otpSecret) |
| `PBAccountInfoResponse` | Account info including subscription status, iCalendar ID |
| `PBAccountChangePasswordResponse` | Password change support |
| `PBUserSubscriptionInfo` | Subscription details (Stripe, IAP, Google Play) |
| `PBUserEmailInfo` | Email preferences (newsletters, onboarding tips) |
| `PBDeletedUserInfo` | Account deletion tracking |
| `PBRedemptionCodeInfo/Response` | Gift code / promo code redemption |
| `PBAuthTokenInfo` | Token introspection and blacklisting |

### List Folders & Organization
| Message | Description |
|---------|-------------|
| `PBListFolder` | Folder containers for organizing lists |
| `PBListFolderItem` | Items within folders (ListType or FolderType) |
| `PBListFolderSettings` | Sort order, color, icon for folders |
| `PBListFolderOperation/List` | Folder mutation operations |
| `PBListFoldersResponse` | Full folder tree response |
| `PBUserListData` | Root folder ID, list ordering |

### List Settings & Theming
| Message | Description |
|---------|-------------|
| `PBListSettings` | Per-list settings (hide categories, sort order, theme, Alexa/Google linking, badge mode, price display, store filters) |
| `PBListSettingsOperation/List` | Settings mutation |
| `PBListTheme` | Custom visual themes (colors, fonts, textures, background images) |
| `PBListThemeList` | Collection of themes |

### Stores & Store Filters
| Message | Description |
|---------|-------------|
| `PBStore` | Store entities (name, list association, sort order) |
| `PBStoreFilter` | Filter views by store (which stores to show, include unassigned) |

### Pricing
| Message | Description |
|---------|-------------|
| `PBItemPrice` | Per-item price (amount, details, store, date) |
| `PBItemQuantity` | Structured quantity (amount, unit, rawQuantity) |
| `PBItemPackageSize` | Package size (size, unit, type) |
| `PBItemQuantityAndPackageSize` | Combined quantity + package |
| `PBItemIngredient` | Links items to recipe ingredients with quantity |

### Categories (User-level)
| Message | Description |
|---------|-------------|
| `PBUserCategory` | User-defined categories with icons and match IDs |
| `PBCategoryGrouping` | Groups of categories with sharing support |
| `PBUserCategoryData` | Full category data container |
| `PBUserCategoryOperation/List` | Category mutations |
| `PBCategorizeItemOperation/List` | Item categorization |
| `PBCategorizedItemsList` | Cached categorized items |
| `PBCategoryOrdering` | Custom category sort orders |
| `PBListCategorizationRule/List` | Auto-categorization rules (item name → category) |

### List Category Groups (Per-List)
| Message | Description |
|---------|-------------|
| `PBListCategoryGroup` | Per-list category groups with logical timestamps |
| `PBListCategory` | Individual categories within a group |
| `PBListItemCategoryAssignment` | Item-to-category assignments |

### Mobile App Settings
| Message | Description |
|---------|-------------|
| `PBMobileAppSettings` | Extensive app config (default list, gestures, Alexa/Google settings, metric units, recipe cooking states, screen lock behavior) |
| `PBMobileAppSettingsOperation/List` | Settings mutations |
| `PBRecipeCookingState` | Tracks cooking progress (checked ingredients, selected step) |
| `PBHintBannerDisplayStats` | UI hint tracking |

### App Notices
| Message | Description |
|---------|-------------|
| `PBAppNotice` | In-app announcements (title, HTML body, CSS) |
| `PBAppNoticesUserData` | Read/dismissed notice tracking |
| `PBAppNoticeOperation/List` | Notice operations |
| `PBAppNoticesResponse` | Full notices response |

### Smart Filters (Recipe)
| Message | Description |
|---------|-------------|
| `PBSmartFilter` | Dynamic recipe filters with conditions |
| `PBSmartCondition` | Individual filter conditions (field, operator, value) |

### Recipe Web Import
| Message | Description |
|---------|-------------|
| `PBRecipeWebImportResponse` | Import recipe from URL (returns parsed recipe, premium check, remaining free imports) |

### Recipe Link Requests (Sharing)
| Message | Description |
|---------|-------------|
| `PBRecipeLinkRequest` | Request to share recipe data between users |
| `PBRecipeLinkRequestResponse` | Response with merged recipe data |

### iCalendar Integration
| Message | Description |
|---------|-------------|
| `PBMealPlanSetICalendarEnabledRequest` | Enable/disable iCal export for meal plans |
| `PBMealPlanSetICalendarEnabledRequestResponse` | Response with updated account info |

### Alexa Integration
| Message | Description |
|---------|-------------|
| `PBAlexaUser` | Alexa account linking |
| `PBAlexaList` / `PBAlexaListItem` | Alexa list sync |
| `PBAlexaListOperation` | Alexa list operations |
| `PBAlexaTask` | Alexa event processing |

### Google Assistant Integration
| Message | Description |
|---------|-------------|
| `PBGoogleAssistantUser` | Google Assistant account linking |
| `PBGoogleAssistantList` / `PBGoogleAssistantListItem` | Google list sync |
| `PBGoogleAssistantListOperation` | Google list operations |
| `PBGoogleAssistantTask` | Google event processing |

### Watch Sync
| Message | Description |
|---------|-------------|
| `PBWatchSyncResponse` | Full watch data sync (lists, items, stores, categories, folders) |
| `PBWatchSyncMultipartResponse/Part` | Chunked sync for large payloads |

### Other / Infrastructure
| Message | Description |
|---------|-------------|
| `Tag` | Product tagging system (with TagType enum: generic, product, category, attribute) |
| `PBIcon` | Icon with tint color |
| `PBNotificationLocation` | Geo-fenced list reminders (lat/lon, name, address) |
| `PBEmailUserIDPair` | User identification for sharing |
| `PBProductLookupResponse` | UPC/barcode product lookup |
| `PBSyncOperation` | Generic sync operation wrapper |
| `PBXRecipe` / `PBXRecipeArchive` / `PBXIngredient` | External recipe import/export format |
| `PBShoppingListArchive` / `PBListFolderArchive` / `PBRecipeDataArchive` | Backup/archive formats |
| Various timestamp/value types | `PBTimestamp`, `PBLogicalTimestamp`, `PBValue`, `PBDeletedObjectID`, etc. |

## High-Value Unexposed Features

### 1. **List Folders** — Organize lists into folders with nesting
The `PBListFolder` and `PBListFolderOperation` types support creating/managing folder hierarchies. Would need new API endpoints: `data/list-folders/update`.

### 2. **Location-Based Reminders** — `PBNotificationLocation`
Lists can have geo-fenced notification locations. Could expose add/remove notification location tools.

### 3. **Item Prices & Store Tracking** — `PBItemPrice`, `PBStore`
Items can have per-store prices with dates. Stores can be created and items assigned to stores. Could enable price comparison/budgeting tools.

### 4. **Auto-Categorization Rules** — `PBListCategorizationRule`
Rules that automatically assign categories to items by name. Could expose rule management.

### 5. **Recipe Web Import** — `PBRecipeWebImportResponse`
Server-side recipe import from URLs. Endpoint likely at `data/recipe-web-import` or similar. Would be extremely useful.

### 6. **Barcode/UPC Lookup** — `PBProductLookupResponse`
Look up products by UPC code. Endpoint likely at `data/product-lookup`.

### 7. **Cooking Mode State** — `PBRecipeCookingState`
Track cooking progress (checked ingredients, current step). Could sync cooking state across devices.

### 8. **iCalendar Export** — `PBMealPlanSetICalendarEnabledRequest`
Enable meal plan export to iCal format for calendar apps.

### 9. **Smart Recipe Filters** — `PBSmartFilter`, `PBSmartCondition`
Dynamic recipe filtering by field/operator/value conditions.

### 10. **List Themes** — `PBListTheme`
Custom visual themes per list (colors, fonts, textures).
