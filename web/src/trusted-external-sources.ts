export type ExternalSourceResolver = (id: string) => string | undefined;

export interface TrustedExternalSourceRegistry {
  register(url: string): { id: string; label: string } | undefined;
  resolve: ExternalSourceResolver;
}

function canonicalHttpsUrl(value: string): string | undefined {
  if (new TextEncoder().encode(value).length > 2048) return;
  try {
    const url = new URL(value);
    if (
      url.href === value &&
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.port
    )
      return url.href;
  } catch {
    // The server response is still validated before it enters the registry.
  }
}

/** Browser-held navigation authority; presentation JSON contains no URLs. */
export function createTrustedExternalSourceRegistry(
  newId: () => string = () => crypto.randomUUID(),
): TrustedExternalSourceRegistry {
  const urls = new Map<string, string>();
  return {
    register(value) {
      const url = canonicalHttpsUrl(value);
      if (!url) return;
      const id = newId();
      urls.set(id, url);
      return { id, label: new URL(url).hostname };
    },
    resolve(id) {
      return urls.get(id);
    },
  };
}
