declare module 'anylist' {
  interface AnyListOptions {
    email: string;
    password: string;
    credentialsFile?: string;
  }

  interface AnyListItem {
    identifier: string;
    name: string;
    details?: string;
    quantity?: string;
    checked: boolean;
    save(): Promise<void>;
  }

  interface AnyListList {
    identifier: string;
    name: string;
    items: AnyListItem[];
    addItem(item: any): Promise<AnyListItem>;
    removeItem(item: AnyListItem): Promise<void>;
    getItemById(id: string): AnyListItem | undefined;
  }

  interface AnyListRecipe {
    identifier: string;
    name: string;
    ingredients: any[];
    preparationSteps: string[];
    instructions: string[];
    servings?: string;
    prepTime?: string;
    cookTime?: string;
    rating?: number;
    source?: string;
    note?: string;
    recipeDataId?: string;
    uid?: string;
    save(): Promise<void>;
    delete(): Promise<void>;
  }

  interface AnyListRecipeCollection {
    identifier: string;
    timestamp: number;
    name: string;
    recipeIds: string[];
    save(): Promise<void>;
    delete(): Promise<void>;
    addRecipe(recipeId: string): Promise<void>;
    removeRecipe(recipeId: string): Promise<void>;
  }

  interface AnyListMealEvent {
    identifier: string;
    title?: string;
    date: Date;
    recipeId?: string;
    mealType?: string;
    note?: string;
    save(): Promise<void>;
    delete(): Promise<void>;
  }

  class AnyList {
    constructor(options: AnyListOptions);

    lists: AnyListList[];
    recipes: AnyListRecipe[];
    mealPlanningCalendarEvents: AnyListMealEvent[];
    recipeDataId: string | null;
    uid: string | undefined;
    calendarId: string | null;

    login(): Promise<void>;
    teardown(): void;

    getLists(): Promise<AnyListList[]>;
    getListById(id: string): AnyListList | undefined;

    getRecipes(): Promise<AnyListRecipe[]>;
    createRecipe(options: any): Promise<AnyListRecipe>;
    createRecipeCollection(options: any): AnyListRecipeCollection;

    createItem(options: any): AnyListItem;

    getMealPlanningCalendarEvents(): Promise<AnyListMealEvent[]>;
    createEvent(options: any): Promise<AnyListMealEvent>;
  }

  export = AnyList;
}
