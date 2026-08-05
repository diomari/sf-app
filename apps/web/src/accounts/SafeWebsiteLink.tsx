const SAFE_SCHEMES = new Set(['http:', 'https:'])

/**
 * Renders an Account website link only when it uses an allowlisted scheme.
 * The shared schema already enforces http/https at the data layer; this is
 * a defense-in-depth check plus safe `rel`/`target` rendering.
 */
export const SafeWebsiteLink = ({ website }: { website: string | null }) => {
  if (website === null) {
    return <span className="muted">—</span>
  }

  let url: URL
  try {
    url = new URL(website)
  } catch {
    return <span className="muted">—</span>
  }

  if (!SAFE_SCHEMES.has(url.protocol)) {
    return <span className="muted">—</span>
  }

  return (
    <a href={url.toString()} target="_blank" rel="noopener noreferrer">
      {website}
    </a>
  )
}
