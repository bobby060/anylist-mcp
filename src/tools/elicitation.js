/**
 * Creates elicitation helper functions bound to a specific McpServer instance.
 * Falls back gracefully when the client doesn't support elicitation.
 */
export function createElicitationHelpers(server) {
  function clientSupportsElicitation() {
    try {
      const caps = server.server.getClientCapabilities();
      return !!(caps && caps.elicitation);
    } catch {
      return false;
    }
  }

  async function elicitOrError(message, schema, fallbackError) {
    if (!clientSupportsElicitation()) {
      throw new Error(fallbackError);
    }
    const result = await server.server.elicitInput({ message, requestedSchema: schema });
    if (result.action === "accept" && result.content) return result.content;
    if (result.action === "decline") throw new Error("User declined to provide input.");
    throw new Error("User cancelled the operation.");
  }

  async function elicitListName(lists) {
    const listNames = lists.map(l => l.name);
    const content = await elicitOrError(
      `Which list? Available lists:\n${listNames.map(n => `- ${n}`).join("\n")}`,
      {
        type: "object",
        properties: { list: { type: "string", enum: listNames, description: "The list to use" } },
        required: ["list"]
      },
      `Multiple lists available (${listNames.join(", ")}). Please specify a list_name.`
    );
    return content.list;
  }

  async function elicitItemChoice(itemName, matchingNames) {
    const content = await elicitOrError(
      `Multiple items match "${itemName}". Which one did you mean?`,
      {
        type: "object",
        properties: { item: { type: "string", enum: matchingNames, description: "The item to select" } },
        required: ["item"]
      },
      `Multiple items match "${itemName}": ${matchingNames.join(", ")}. Please specify the exact item name.`
    );
    return content.item;
  }

  async function elicitConfirmation(message) {
    const content = await elicitOrError(
      message,
      {
        type: "object",
        properties: { confirm: { type: "boolean", description: "Confirm the action" } },
        required: ["confirm"]
      },
      message + " (cannot confirm without elicitation support)"
    );
    return content.confirm;
  }

  async function elicitRequiredField(fieldName, message) {
    const content = await elicitOrError(
      message,
      {
        type: "object",
        properties: { [fieldName]: { type: "string", description: `The ${fieldName} to provide` } },
        required: [fieldName]
      },
      `Missing required parameter "${fieldName}". ${message}`
    );
    return content[fieldName];
  }

  return { elicitListName, elicitItemChoice, elicitConfirmation, elicitRequiredField };
}
