// Centralized DOM access. Uses the global DOMParser (native in browsers;
// node tests inject one from jsdom via globalThis.DOMParser).

function getDOMParser(): typeof DOMParser {
  const P = (globalThis as { DOMParser?: typeof DOMParser }).DOMParser
  if (!P) throw new Error('DOMParser is not available in this environment')
  return P
}

export function parseXml(source: string): Document {
  return new (getDOMParser())().parseFromString(source, 'application/xml')
}

export function parseHtml(source: string): Document {
  return new (getDOMParser())().parseFromString(source, 'text/html')
}
