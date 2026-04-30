export function parseJsonResponse(content: string): unknown {
  const trimmed = content.trim();

  if (trimmed.startsWith("```")) {
    const withoutFence = trimmed
      .replace(/^```(?:json)?\s*/u, "")
      .replace(/\s*```$/u, "");

    return JSON.parse(withoutFence);
  }

  return JSON.parse(trimmed);
}
