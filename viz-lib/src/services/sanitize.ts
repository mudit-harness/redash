import { isString } from "lodash";
import DOMPurify from "dompurify";

// Schemes that are safe to link to / load from. Anything else - most importantly `javascript:`, `vbscript:` and
// `data:` - is dropped. The last two branches keep relative URLs (`/foo`, `foo.html`, `#anchor`) working.
const ALLOWED_URI_REGEXP = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

// DOMPurify allows `data:` URIs on media tags out of the box and there is no config flag to turn that off, so
// they are re-checked in the hook below: only inert raster images are kept, because `data:image/svg+xml` and
// `data:text/html` can carry markup and script.
const ALLOWED_DATA_URI_REGEXP = /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif|x-icon);base64,[a-z0-9+/=]+$/i;

// URL-bearing attributes that are re-checked after DOMPurify has run.
const URI_ATTRIBUTES = ["href", "src", "xlink:href", "action", "formaction", "background", "poster", "srcset"];

// Policy for untrusted, user-authored HTML (dashboard text widgets, query/visualization descriptions, table
// columns with `allowHTML`). It keeps the formatting Redash content relies on - links, lists, tables, emphasis,
// headings, images - and removes everything that can execute script or hijack the page.
//
// NOTE: DOMPurify ignores per-call configs once `setConfig()` has been used, so the policy is installed once,
// globally, below; do not pass a config to `sanitize()` - it would be silently ignored.
// `client/app/services/sanitize.js` configures the same DOMPurify instance and must be kept in sync.
const SANITIZE_CONFIG = {
  // Allow-list based HTML profile only: no SVG / MathML, which are common mutation-XSS vectors.
  USE_PROFILES: { html: true },
  // `target` is not part of the default attribute allow-list; the hook below restricts it to `_blank`.
  ADD_ATTR: ["target"],
  // Active content, framing and form/phishing elements are never legitimate formatting.
  FORBID_TAGS: [
    "script",
    "style",
    "iframe",
    "frame",
    "frameset",
    "object",
    "embed",
    "applet",
    "base",
    "link",
    "meta",
    "template",
    "form",
    "input",
    "button",
    "select",
    "textarea",
  ],
  // `style` enables CSS-based injection (data exfiltration via attribute selectors, click-jacking overlays);
  // the others are alternative URL sinks that sidestep the `href`/`src` checks.
  FORBID_ATTR: ["style", "srcset", "action", "formaction", "background", "poster", "ping"],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ALLOWED_URI_REGEXP,
  // Drop the content of removed active elements, and guard against DOM clobbering via `id` / `name`.
  KEEP_CONTENT: true,
  SANITIZE_DOM: true,
};

DOMPurify.setConfig(SANITIZE_CONFIG);

DOMPurify.addHook("afterSanitizeAttributes", function (node) {
  // Fix elements with `target` attribute:
  // - allow only `target="_blank"
  // - add `rel="noopener noreferrer"` to prevent https://www.owasp.org/index.php/Reverse_Tabnabbing

  const target = node.getAttribute("target");
  if (isString(target) && target.toLowerCase() === "_blank") {
    node.setAttribute("rel", "noopener noreferrer");
  } else {
    node.removeAttribute("target");
  }

  // Drop URL attributes pointing at a scheme that can execute script or render markup. Whitespace is ignored by
  // browsers inside URLs, so it is stripped before matching; anything that does not match an allow-listed form
  // is removed (fail closed).
  for (const attribute of URI_ATTRIBUTES) {
    const value = node.getAttribute(attribute);
    if (!isString(value)) {
      continue;
    }
    const url = value.replace(/\s/g, "");
    if (url !== "" && !ALLOWED_URI_REGEXP.test(url) && !ALLOWED_DATA_URI_REGEXP.test(url)) {
      node.removeAttribute(attribute);
    }
  }
});

/**
 * Sanitizes untrusted HTML before it is injected into the DOM (`dangerouslySetInnerHTML`, Leaflet
 * tooltips / popups, ...) using `SANITIZE_CONFIG` above.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty);
}

export { DOMPurify };

export default sanitizeHtml;
