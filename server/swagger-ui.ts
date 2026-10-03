/**
 * server/swagger-ui.ts
 *
 * The interactive API documentation page served at /api/docs/ui.
 *
 * Design:
 * - Colors come from one set of tokens copied from the web app
 *   (client/src/index.css). Dark mode only redefines the tokens, so both themes
 *   share every rule and stay consistent.
 * - Swagger UI hard-codes dark text, light surfaces, and generic fonts on many
 *   selectors. The selector lists below come from swagger-ui-dist@5.33.1's
 *   swagger-ui.css; regenerate them when bumping SWAGGER_UI_VERSION.
 * - Code samples use Swagger UI's built-in highlight themes (idea / tomorrow-night),
 *   so no script has to repaint the page after it renders.
 * - Assets are pinned and checked with Subresource Integrity.
 */

export const SWAGGER_UI_VERSION = "5.33.1";
const CDN = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;
const SRI = {
  css: "sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW",
  bundle: "sha384-ZPehFMQommnnuaZ4rpxgkgTT2DKFVp4hZC/7pLit+9Lek9T1YGSo23eHFbvNkXkw",
};

/** Swagger UI selectors that hard-code dark text (#3b4151 and similar) */
const TEXT_SELECTORS = [
  "mark", ".opblock-tag", ".parameter__type", ".opblock .opblock-section-header>label",
  ".opblock .opblock-section-header h4",
  ".opblock .opblock-summary-path", ".opblock .opblock-summary-path__deprecated",
  ".opblock .opblock-summary-description", ".tab li", ".opblock-description-wrapper",
  ".opblock-external-docs-wrapper", ".opblock-title_normal", ".opblock-description-wrapper h4",
  ".opblock-external-docs-wrapper h4", ".opblock-title_normal h4", ".opblock-description-wrapper p",
  ".opblock-external-docs-wrapper p", ".opblock-title_normal p", ".responses-inner h4",
  ".responses-inner h5", ".response-col_status", ".scheme-container .schemes>.schemes-server-container>label",
  ".loading-container .loading:after", "section h3", "span.token-string", "span.token-not-formatted",
  ".btn", ".authorization__btn", ".expand-methods", ".expand-operation", ".opblock-control-arrow",
  "select", "label", "textarea", ".checkbox", ".checkbox p", ".dialog-ux .modal-ux-content p",
  ".dialog-ux .modal-ux-content h4", ".dialog-ux .modal-ux-header h3", ".model",
  "section.models h4", ".model-title", ".servers>label", "table.headers td", "table thead tr td",
  "table thead tr th", ".parameter__name", ".info h1", ".info h2", ".info h3", ".info h4", ".info h5",
  ".info li", ".info p", ".info table", ".info .title", ".auth-container .errors", ".scopes h2",
  ".errors-wrapper .errors h4", ".errors-wrapper .errors small", ".errors-wrapper hgroup h4",
  ".markdown pre", ".renderedMarkdown pre",
];

/** Swagger UI selectors that hard-code secondary (grey) text */
const MUTED_TEXT_SELECTORS = [
  ".opblock-tag small", ".response-col_links", ".model .property.primitive", ".prop-format",
  ".parameter__in", ".parameter__deprecated", ".parameter__extension", ".response__extension",
  ".info .base-url", ".opblock .opblock-summary-operation-id",
];

/** Swagger UI selectors that hard-code light surfaces (#fff, #f7f7f7, ...) */
const SURFACE_SELECTORS = [
  "select", "select[multiple]", "input[type=email]", "input[type=file]", "input[type=password]",
  "input[type=search]", "input[type=text]", "textarea", "input[disabled]", "select[disabled]",
  "textarea[disabled]", ".checkbox input[type=checkbox]+label>.item", ".dialog-ux .modal-ux",
];

/** Swagger UI selectors that set font-family: sans-serif */
const SANS_SELECTORS = [
  "button", "input", "optgroup", "select", ".opblock-tag", ".opblock-tag small",
  ".opblock .opblock-section-header>label", ".opblock .opblock-section-header h4",
  ".opblock .opblock-summary-method", ".opblock .opblock-summary-description", ".tab li",
  ".opblock-description-wrapper", ".opblock-external-docs-wrapper", ".opblock-title_normal",
  ".opblock-description-wrapper h4", ".opblock-description-wrapper p", ".responses-inner h4",
  ".responses-inner h5", ".response-col_status", ".response-col_links", ".download-contents",
  ".scheme-container .schemes>.schemes-server-container>label", ".loading-container .loading:after",
  "section h3", ".btn", ".btn.cancel", "label", ".dialog-ux .modal-ux-content p",
  ".dialog-ux .modal-ux-content h4", ".dialog-ux .modal-ux-header h3", "section.models h4",
  "section.models h5", ".model-title", ".model-deprecated-warning", ".servers>label",
  "table thead tr td", "table thead tr th", ".parameter__name", ".info h1", ".info h2", ".info h3",
  ".info h4", ".info h5", ".info li", ".info p", ".info table", ".info a", ".info .title",
  ".info .title small pre", ".scopes h2", ".errors-wrapper hgroup h4",
];

/** Swagger UI selectors that set a monospace font */
const MONO_SELECTORS = [
  "code", ".parameter__type", ".opblock .opblock-summary-operation-id", ".opblock .opblock-summary-path",
  ".opblock .opblock-summary-path__deprecated", ".response-col_status .response-undocumented",
  ".response-col_links .response-undocumented", ".opblock-body pre.microlight", "textarea", "textarea.curl",
  ".model", "table.headers td", ".parameter__extension", ".parameter__in", ".parameter__deprecated",
  ".response__extension", ".info .base-url", ".markdown code", ".renderedMarkdown code", ".microlight",
];

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

const scoped = (selectors: string[]) => selectors.map((s) => `.swagger-ui ${s}`).join(",\n");
const methodBlocks = METHODS.map((m) => `.opblock-${m}`).join(",");

/** Chevron for <select>, drawn in a mid-tone that reads on both themes */
const SELECT_ARROW = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

const STYLES = `
    /* === Tokens (mirrors client/src/index.css) === */
    :root {
      color-scheme: light;
      --background: hsl(210, 20%, 98%);
      --foreground: hsl(222, 47%, 11%);
      --card: hsl(0, 0%, 100%);
      --border: hsl(214, 20%, 88%);
      --input: hsl(214, 20%, 57%);
      --muted: hsl(210, 20%, 96%);
      --muted-foreground: hsl(215, 16%, 45%);
      --primary: hsl(221, 83%, 53%);
      --primary-foreground: hsl(0, 0%, 100%);
      --secondary: hsl(214, 32%, 91%);
      --destructive: hsl(0, 72%, 51%);
      --code-bg: hsl(210, 20%, 96%);
      --success: hsl(163, 94%, 24%);
      --copy-bg: hsl(215, 16%, 47%);
      /* HTTP methods: white text at 4.5:1 or better, identical in both themes */
      --method-get: #2563eb;
      --method-post: #047857;
      --method-put: #b45309;
      --method-patch: #7c3aed;
      --method-delete: #dc2626;
      --method-other: #475569;
      --radius: 0.5rem;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    html.dark {
      color-scheme: dark;
      --background: hsl(222, 47%, 8%);
      --foreground: hsl(210, 20%, 98%);
      --card: hsl(222, 47%, 11%);
      --border: hsl(217, 33%, 17%);
      --input: hsl(217, 33%, 45%);
      --muted: hsl(217, 33%, 17%);
      --muted-foreground: hsl(215, 20%, 65%);
      --primary: hsl(217, 91%, 60%);
      --primary-foreground: hsl(222, 47%, 8%);
      --secondary: hsl(217, 33%, 17%);
      --destructive: hsl(0, 62%, 63%);
      --code-bg: hsl(222, 47%, 6%);
      --success: hsl(160, 70%, 50%);
      --copy-bg: hsl(215, 19%, 35%);
    }

    /* === Page chrome (matches the web app) === */
    html, body { background-color: var(--background); color: var(--foreground); }
    body { margin: 0; font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
    a { color: var(--primary); }
    :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

    .theme-bar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.5rem 1.5rem;
      border-bottom: 1px solid var(--border);
      background-color: color-mix(in srgb, var(--muted) 20%, transparent);
    }
    .home-link, #theme-toggle {
      display: inline-flex; align-items: center; gap: 0.5rem;
      height: 2.5rem; padding: 0 0.75rem; border: 0; border-radius: var(--radius);
      background: transparent; color: var(--muted-foreground);
      font: 500 0.875rem var(--font-sans); text-decoration: none; cursor: pointer;
      transition: background-color 0.15s, color 0.15s;
    }
    #theme-toggle { width: 2.5rem; padding: 0; justify-content: center; }
    .home-link:hover, #theme-toggle:hover { background-color: var(--muted); color: var(--foreground); }
    .home-link svg, #theme-toggle svg { width: 1.25rem; height: 1.25rem; }
    #theme-toggle .sun-icon, html.dark #theme-toggle .moon-icon { display: none; }
    html.dark #theme-toggle .sun-icon { display: block; }

    .container { max-width: 1600px; margin: 0 auto; padding: 0 1.5rem 2rem; }
    header {
      margin: 0 -1.5rem 1.5rem; padding: 1rem 1.5rem; text-align: center;
      border-bottom: 1px solid var(--border);
      background-color: color-mix(in srgb, var(--muted) 20%, transparent);
    }
    header img { width: 4rem; height: 4rem; border-radius: var(--radius); margin-bottom: 0.5rem; transition: opacity 0.2s; }
    header a:hover img { opacity: 0.8; }
    header h1 { font-size: 2.25rem; font-weight: 700; letter-spacing: -0.025em; margin: 0.75rem 0; }
    header p { color: var(--muted-foreground); font-size: 1.125rem; line-height: 1.75; max-width: 42rem; margin: 0 auto; }
    footer {
      margin: 2rem -1.5rem 0; padding: 2rem 1.5rem; text-align: center;
      border-top: 1px solid var(--border);
      background-color: color-mix(in srgb, var(--muted) 30%, transparent);
      color: var(--muted-foreground); font-size: 0.875rem;
    }
    footer p { max-width: 42rem; margin: 0 auto 0.75rem; line-height: 1.75; }
    footer a { font-weight: 500; text-decoration: none; }
    footer a:hover { text-decoration: underline; }
    footer .license { font-size: 0.75rem; }

    /* === Swagger UI: typography and colors === */
    .swagger-ui { color: var(--foreground); font-family: var(--font-sans); }
${scoped(SANS_SELECTORS)} { font-family: var(--font-sans); }
${scoped(MONO_SELECTORS)} { font-family: var(--font-mono); }
${scoped(TEXT_SELECTORS)} { color: var(--foreground); }
${scoped(MUTED_TEXT_SELECTORS)} { color: var(--muted-foreground); }
    /* Model names carry both .model (monospace) and .model-title; keep titles in the UI font */
    .swagger-ui .model-title, .swagger-ui .model-title .model { font-family: var(--font-sans); }
    .swagger-ui .model .property { color: var(--muted-foreground); }
    .swagger-ui a, .swagger-ui .info a { color: var(--primary); }
    .swagger-ui a.nostyle, .swagger-ui a.nostyle:visited { color: inherit; }
    .swagger-ui .prop-type { color: var(--primary); }
    .swagger-ui .parameter__name.required:after, .swagger-ui .parameter__name.required span { color: var(--destructive); }
    .swagger-ui .markdown code, .swagger-ui .renderedMarkdown code {
      background: var(--muted); color: var(--foreground); border-radius: 0.25rem; padding: 0.1em 0.35em;
    }

    /* Swagger's own layout padding would misalign its cards with ours */
    .swagger-ui .wrapper { max-width: none; padding: 0; }
    .swagger-ui .information-container .info,
    .swagger-ui .info { margin: 0 0 1.5rem; }

    /* === Cards: info, servers, models === */
    .swagger-ui .info,
    .swagger-ui .scheme-container,
    .swagger-ui section.models {
      background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: none;
    }
    .swagger-ui .info { padding: 1.5rem; }
    .swagger-ui .info .title { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 1.75rem; }
    .swagger-ui .info .title small {
      top: 0; margin: 0; padding: 0.15rem 0.6rem; border-radius: 9999px;
      background: var(--secondary); color: var(--foreground);
    }
    .swagger-ui .info .title small pre { color: inherit; font-family: var(--font-mono); font-size: 0.75rem; }
    .swagger-ui .info .title small.version-stamp { background: var(--primary); color: var(--primary-foreground); }
    .swagger-ui .scheme-container { margin: 0 0 1.5rem; padding: 1rem 1.5rem; }
    .swagger-ui section.models { margin: 1.5rem 0 0; }
    .swagger-ui section.models.is-open h4 { border-bottom-color: var(--border); }
    .swagger-ui section.models .model-container { background: var(--muted); border-radius: calc(var(--radius) - 2px); }
    .swagger-ui section.models .model-container:hover { background: var(--secondary); }
    .swagger-ui .model-box { background: transparent; }

    /* === Inputs and buttons === */
${scoped(SURFACE_SELECTORS)} {
      background-color: var(--card); color: var(--foreground);
      border: 1px solid var(--input); border-radius: calc(var(--radius) - 2px); box-shadow: none;
    }
    .swagger-ui select { background-image: ${SELECT_ARROW}; background-repeat: no-repeat; background-position: right 0.6rem center; padding-right: 2rem; }
    .swagger-ui .btn {
      background: var(--card); color: var(--foreground); border: 1px solid var(--input);
      border-radius: calc(var(--radius) - 2px); box-shadow: none;
    }
    .swagger-ui .btn:hover { background: var(--muted); box-shadow: none; }
    .swagger-ui .btn.execute { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }
    .swagger-ui .btn.execute:hover { filter: brightness(1.08); }
    .swagger-ui .btn.cancel { background: transparent; border-color: var(--destructive); color: var(--destructive); }
    .swagger-ui .copy-to-clipboard { background-color: var(--copy-bg); border-radius: 0.25rem; }
    .swagger-ui .download-contents { background: var(--copy-bg); border-radius: 0.25rem; }

    /* === Operations === */
    .swagger-ui .opblock-tag { border-bottom-color: var(--border); }
    .swagger-ui .opblock-tag:hover { background: var(--muted); }
    .swagger-ui .opblock.opblock-get { --method: var(--method-get); }
    .swagger-ui .opblock.opblock-post { --method: var(--method-post); }
    .swagger-ui .opblock.opblock-put { --method: var(--method-put); }
    .swagger-ui .opblock.opblock-patch { --method: var(--method-patch); }
    .swagger-ui .opblock.opblock-delete { --method: var(--method-delete); }
    .swagger-ui .opblock:is(.opblock-head, .opblock-options) { --method: var(--method-other); }
    .swagger-ui .opblock:is(${methodBlocks}) {
      background: var(--card); border: 1px solid var(--border); border-left: 4px solid var(--method);
      border-radius: var(--radius); box-shadow: none; margin: 0 0 0.75rem;
    }
    .swagger-ui .opblock:is(${methodBlocks}) .opblock-summary { border-color: var(--border); }
    .swagger-ui .opblock:is(${methodBlocks}) .opblock-summary-method {
      background: var(--method); color: #fff; text-shadow: none; border-radius: calc(var(--radius) - 2px);
    }
    .swagger-ui .opblock:is(${methodBlocks}) .tab-header .tab-item.active h4 span:after { background: var(--method); }
    .swagger-ui .opblock .opblock-section-header { background: var(--muted); box-shadow: none; }
    .swagger-ui .opblock .opblock-summary-control:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
    .swagger-ui table thead tr th, .swagger-ui table thead tr td,
    .swagger-ui .responses-table, .swagger-ui .response { border-color: var(--border); }
    .swagger-ui .parameters-col_description input { max-width: 100%; }

    /* Code samples: the highlight theme colors tokens inline; the panel follows our tokens.
       Plain blocks (request URL, response headers) get no inline color, and Swagger's own
       default is white text, so set the base color here. */
    .swagger-ui .microlight,
    .swagger-ui .highlight-code > .microlight,
    .swagger-ui .opblock-body pre.microlight,
    .swagger-ui .curl-command .curl {
      background: var(--code-bg) !important;
      color: var(--foreground);
      border: 1px solid var(--border); border-radius: calc(var(--radius) - 2px);
    }
    .swagger-ui .response-control-media-type__accept-message { color: var(--success); }
    .swagger-ui .response-control-media-type--accept-controller select { border-color: var(--success); }

    /* Icons Swagger draws as dark SVGs */
    .swagger-ui svg.arrow, .swagger-ui .opblock-control-arrow, .swagger-ui .expand-operation svg,
    .swagger-ui .models-control svg, .swagger-ui .model-box-control svg { fill: currentColor; }
    html.dark .swagger-ui .model-toggle:after { filter: invert(1); }
`;

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CIDR Subnet Calculator API Documentation</title>
  <link rel="icon" type="image/png" href="/favicon.png">
  <script>
    // Apply the saved theme before anything paints (same rule as the web app: default light)
    (function () {
      var theme = 'light';
      try { if (localStorage.getItem('theme') === 'dark') theme = 'dark'; } catch (e) {}
      document.documentElement.className = theme;
    })();
  </script>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap">
  <link rel="stylesheet" href="${CDN}/swagger-ui.css" integrity="${SRI.css}" crossorigin="anonymous">
  <style>${STYLES}  </style>
</head>
<body>
  <div class="theme-bar">
    <a class="home-link" href="/" aria-label="Back to calculator">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      <span>Calculator</span>
    </a>
    <button id="theme-toggle" type="button" aria-label="Switch to dark mode" title="Switch to dark mode">
      <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>
        <path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
      </svg>
      <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
      </svg>
    </button>
  </div>
  <div class="container">
    <header>
      <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer">
        <img src="/github-nicholashoule.png" alt="GitHub QR Code" width="64" height="64">
      </a>
      <h1>API Documentation</h1>
      <p>Interactive reference for the CIDR Subnet Calculator REST API. Expand an endpoint and choose "Try it out" to send a real request to this server.</p>
    </header>
    <div id="swagger-ui"></div>
    <footer>
      <p>
        Interactive API documentation powered by Swagger UI.
        Plans are computed from the request alone; nothing is stored.
      </p>
      <p>
        Created by <a href="https://github.com/nicholashoule" target="_blank" rel="noopener noreferrer">nicholashoule</a>
      </p>
      <p class="license">
        <a href="https://github.com/nicholashoule/subnet-splitter/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a>
      </p>
    </footer>
  </div>
  <script src="${CDN}/swagger-ui-bundle.js" integrity="${SRI.bundle}" crossorigin="anonymous"></script>
  <script>
    (function () {
      var root = document.documentElement;
      var toggle = document.getElementById('theme-toggle');

      function savedTheme() {
        try { return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; }
      }

      // Swagger UI fixes its code-highlighting theme at startup, so a theme change
      // re-mounts it on a fresh node (no page reload, no repaint script).
      function render(theme) {
        root.className = theme;
        // Name the action, so screen readers hear what a press will do
        var label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
        var old = document.getElementById('swagger-ui');
        var mount = old.cloneNode(false);
        old.replaceWith(mount);
        window.ui = SwaggerUIBundle({
          url: '/api/docs',
          domNode: mount,
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout',
          syntaxHighlight: { activated: true, theme: theme === 'dark' ? 'tomorrow-night' : 'idea' },
          // Show each property's type and description without an extra click
          defaultModelExpandDepth: 2,
          // Don't send the spec to validator.swagger.io; the spec is validated in CI
          validatorUrl: null
        });
      }

      toggle.addEventListener('click', function () {
        var next = root.className === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('theme', next); } catch (e) {}
        render(next);
      });

      // Stay in sync with the web app when the theme changes in another tab
      window.addEventListener('storage', function (e) {
        if (e.key === 'theme') render(savedTheme());
      });

      render(savedTheme());
    })();
  </script>
</body>
</html>
`;

/** The complete documentation page (static, so it is built once) */
export const swaggerUiHtml = HTML;
