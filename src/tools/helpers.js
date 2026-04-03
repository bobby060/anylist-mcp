export function errorResponse(msg) {
  return { content: [{ type: "text", text: msg }], isError: true };
}

export function textResponse(msg) {
  return { content: [{ type: "text", text: msg }] };
}

export function requireParams(params, required, action) {
  for (const key of required) {
    if (params[key] === undefined || params[key] === null || params[key] === "") {
      throw new Error(`Action "${action}" requires parameter "${key}"`);
    }
  }
}
