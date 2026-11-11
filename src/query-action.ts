export type QueryAction =
  | { kind: 'address'; url: string }
  | { kind: 'search'; query: string }
  | { kind: 'invalid'; reason: string };

export function queryAction(value: string): QueryAction | undefined {
  const text = value.trim();
  if (!text) return;
  if (text.length > 4096 || /[\u0000-\u001f\u007f]/.test(text)) return { kind: 'invalid', reason: 'Enter a shorter address or search without control characters.' };
  if (/^(?:javascript|data|file|about|chrome|resource|moz-extension|blob|ftp|mailto):/i.test(text) ||
    (/^[a-z][a-z\d+.-]*:\/\//i.test(text) && !/^https?:\/\//i.test(text))) {
    return { kind: 'invalid', reason: 'Only HTTP and HTTPS addresses can be opened here.' };
  }
  const explicit = /^https?:/i.test(text);
  if (explicit && !/^https?:\/\//i.test(text)) return { kind: 'invalid', reason: 'Use a complete http:// or https:// address.' };
  if (!explicit && (/\s/.test(text) || text.includes('@'))) return { kind: 'search', query: text };
  try {
    const url = new URL(explicit ? text : text.startsWith('//') ? `https:${text}` : `https://${text}`);
    if (url.username || url.password) return { kind: 'invalid', reason: 'Addresses containing login credentials are not supported.' };
    const host = url.hostname;
    const local = host === 'localhost' || host.endsWith('.localhost') || host.startsWith('[') || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
    const domain = host.includes('.') && host.split('.').every(label => /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label)) &&
      /^(?:[a-z]{2,63}|xn--[a-z\d-]+)$/i.test(host.split('.').at(-1)!);
    if (!explicit && !local && !domain) return { kind: 'search', query: text };
    // Plain numeric input is a search, even though URL() accepts integer IPs.
    if (!explicit && local && /^\d+(?:\.\d+){0,2}$/.test(text)) return { kind: 'search', query: text };
    if (!explicit && local) url.protocol = 'http:';
    return { kind: 'address', url: url.href };
  } catch {
    return explicit ? { kind: 'invalid', reason: 'Check the address and port.' } : { kind: 'search', query: text };
  }
}
