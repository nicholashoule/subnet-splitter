# Swagger UI Light/Dark Mode Theming

## Overview

This document describes the implementation of light/dark mode theming for Swagger UI in the CIDR Subnet Calculator API documentation.

## Problem Statement

Swagger UI v5 has inconsistent theming behavior:
- Default syntax highlighter uses dark "agate" theme regardless of page theme
- PlainTextViewer component (used when syntax highlighting is disabled) applies `.microlight` class with dark backgrounds
- Inline styles from react-syntax-highlighter override CSS `!important` declarations
- Code examples display with dark backgrounds in light mode
- Theme changes don't persist when navigating between webapp and Swagger UI

## Solution Architecture

### 1. CSS-Based Theming

**File**: `server/routes.ts` (inline CSS in Swagger UI HTML)

**Light Mode CSS** (lines ~140-290):
- All Swagger UI elements explicitly styled with light colors
- Code/example sections: `background: hsl(210, 20%, 99%)`, `color: hsl(222, 47%, 11%)`
- Version badges: Blue backgrounds with white text
- Tables, inputs, buttons: White backgrounds with dark text

**Dark Mode CSS** (lines ~385-560):
- Scoped with `html.dark` selector
- Dark backgrounds: `hsl(222, 47%, 8%)` to `hsl(222, 47%, 11%)`
- Light text: `hsl(210, 20%, 98%)`
- Version badges: Dark gray/green backgrounds

### 2. Syntax Highlighting Configuration

**File**: `server/routes.ts` (lines ~700-707)

```javascript
const currentTheme = localStorage.getItem('theme') || 'light';
const syntaxHighlightConfig = currentTheme === 'dark' 
  ? { activated: true, theme: 'tomorrow-night' }
  : { activated: false };
```

**Strategy**:
- **Light mode**: Disable syntax highlighting (`activated: false`)
  - Uses PlainTextViewer component (plain text with `.microlight` class)
  - Prevents dark theme colors from being injected
- **Dark mode**: Enable syntax highlighting with `tomorrow-night` theme
  - Provides proper dark theme for code examples

**Why this works**:
- Light themes in react-syntax-highlighter still use dark colors
- Disabling highlighting avoids inline styles that override CSS
- Dark mode can use proper themed highlighting

### 3. JavaScript Style Enforcement

**File**: `server/routes.ts` (lines ~710-745)

**onComplete Callback**: Runs after Swagger UI finishes rendering

```javascript
function applyLightStyles() {
  const activeTheme = localStorage.getItem('theme') || 'light';
  if (activeTheme === 'light') {
    document.querySelectorAll('.swagger-ui .microlight, .swagger-ui pre, ...').forEach(el => {
      el.style.setProperty('background', 'hsl(210, 20%, 99%)', 'important');
      el.style.setProperty('color', 'hsl(222, 47%, 11%)', 'important');
      // Apply to all children
      el.querySelectorAll('*').forEach(child => {
        child.style.setProperty('background', 'transparent', 'important');
        child.style.setProperty('color', 'hsl(222, 47%, 11%)', 'important');
      });
    });
  }
}
```

**Why inline styles with `'important'` flag**:
- Swagger UI's react-syntax-highlighter applies inline styles
- Inline styles have higher specificity than CSS `!important`
- Using `style.setProperty(prop, value, 'important')` creates inline important styles
- This is the only way to override Swagger UI's inline styles

**Event Listeners**:

1. **Initial Application** (line ~811):
   ```javascript
   setTimeout(applyLightStyles, 100);
   // Also apply after a longer delay to catch late-rendered elements
   setTimeout(applyLightStyles, 500);
   ```
   - 100ms delay ensures Swagger UI finishes rendering
   - 500ms delay catches late-rendered elements (like pre-expanded sections)
   - Applies styles after all components mount

2. **Click Events** (lines ~815-822):
   ```javascript
   document.addEventListener('click', (e) => {
     if (e.target.closest('.swagger-ui') || e.target.closest('#swagger-ui')) {
       setTimeout(applyLightStyles, 50);
       // Also apply after a longer delay for dynamically loaded content
       setTimeout(applyLightStyles, 200);
     }
   });
   ```
   - Reapplies styles when user interacts with Swagger UI
   - Catches expand/collapse operations, tab changes, etc.
   - Dual delays (50ms + 200ms) ensure dynamically loaded content is styled

3. **MutationObserver** (lines ~825-835):
   ```javascript
   const mutationObserver = new MutationObserver((mutations) => {
     // Debounce: only apply if we haven't recently applied
     clearTimeout(window._swaggerStyleTimeout);
     window._swaggerStyleTimeout = setTimeout(applyLightStyles, 50);
   });
   
   mutationObserver.observe(swaggerContainer, {
     childList: true,
     subtree: true
   });
   ```
   - Watches for any DOM changes in the Swagger UI container
   - Automatically applies styles when new elements are added
   - Debounced to prevent excessive calls during rapid DOM updates
   - Essential for "Try it out" sections which are rendered on-demand

4. **IntersectionObserver** (lines ~838-849):
   ```javascript
   const observer = new IntersectionObserver((entries) => {
     entries.forEach(entry => {
       if (entry.isIntersecting) {
         setTimeout(applyLightStyles, 50);
       }
     });
   }, { threshold: 0.1 });
   observer.observe(swaggerContainer);
   ```
   - Detects when Swagger UI becomes visible
   - Handles navigation from webapp back to Swagger UI
   - Threshold 0.1 means trigger when 10% visible

### 4. "Try it out" Section Styling

**File**: `server/routes.ts` (lines ~791-809)

The "Try it out" button in Swagger UI reveals a form for testing API endpoints. These elements are rendered dynamically and require explicit JavaScript enforcement:

```javascript
// Textarea for request body
document.querySelectorAll('.swagger-ui textarea, .swagger-ui .body-param textarea, .swagger-ui .body-param__text').forEach(el => {
  el.style.setProperty('background-color', 'white', 'important');
  el.style.setProperty('color', 'hsl(222, 47%, 11%)', 'important');
  el.style.setProperty('border', '1px solid hsl(214, 20%, 88%)', 'important');
});

// Response sections (live responses after Execute)
document.querySelectorAll('.swagger-ui .responses-inner, .swagger-ui .response-col_description, .swagger-ui .response-col_description__inner').forEach(el => {
  el.style.setProperty('background-color', 'white', 'important');
  el.style.setProperty('color', 'hsl(222, 47%, 11%)', 'important');
});

// Curl command display and response body
document.querySelectorAll('.swagger-ui .curl-command, .swagger-ui .request-url, .swagger-ui .response-body, .swagger-ui .live-responses-table').forEach(el => {
  el.style.setProperty('background-color', 'white', 'important');
  el.style.setProperty('color', 'hsl(222, 47%, 11%)', 'important');
});
```

**Elements Styled**:
- **Request body textarea**: `.body-param textarea`, `.body-param__text`
- **Response sections**: `.responses-inner`, `.response-col_description`
- **Curl/URL display**: `.curl-command`, `.request-url`
- **Live response table**: `.live-responses-table`, `.response-body`

**Why MutationObserver is essential**:
- "Try it out" elements don't exist until user clicks the button
- CSS rules apply but Swagger UI's inline styles override them
- MutationObserver catches when these elements are added to DOM
- Automatically triggers `applyLightStyles()` to enforce correct colors

### 5. Theme Toggle & Persistence

**File**: `server/routes.ts` (lines ~670-695)

**Theme Initialization** (line ~670):
```javascript
const currentTheme = localStorage.getItem('theme') || 'light';
document.documentElement.className = currentTheme;
```

**Theme Toggle Button** (lines ~678-683):
```javascript
themeToggle.addEventListener('click', () => {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', newTheme);
  location.reload(); // Reload to reinitialize Swagger UI with new config
});
```

**Why reload is necessary**:
- Swagger UI initializes with `syntaxHighlight` config at load time
- Changing themes requires different syntax highlighting configuration
- Reloading allows SwaggerUIBundle to reinitialize with correct theme

**Cross-Tab Synchronization** (lines ~686-691):
```javascript
window.addEventListener('storage', (e) => {
  if (e.key === 'theme' && e.newValue) {
    location.reload();
  }
});
```
- Listens for theme changes from other tabs (e.g., webapp)
- Reloads Swagger UI to apply new theme

## Technical Challenges & Solutions

### Challenge 1: CSS Specificity

**Problem**: Swagger UI's inline styles override CSS `!important` rules

**Solution**: Use JavaScript `style.setProperty(prop, value, 'important')` to create inline important styles

**Example**:
```javascript
el.style.setProperty('background', 'hsl(210, 20%, 99%)', 'important');
// Creates: style="background: hsl(210, 20%, 99%) !important"
```

### Challenge 2: Dynamic Content Loading

**Problem**: Swagger UI adds elements after `onComplete` fires

**Solution**: Multiple event listeners catch different scenarios:
- IntersectionObserver for visibility changes
- Click events for user interactions
- Storage events for cross-tab sync

### Challenge 3: Syntax Highlighter Dark Themes

**Problem**: Light syntax highlighter themes still use dark colors

**Solution**: Disable syntax highlighting in light mode entirely

**Alternative considered**: Custom CSS to override all syntax highlighter classes
- **Rejected**: Fragile, requires updating for every token class
- **Better**: Disable highlighting, use plain text with custom styling

### Challenge 4: SPA Navigation

**Problem**: Navigating from webapp to Swagger UI doesn't trigger page reload

**Solution**: IntersectionObserver detects when Swagger UI container becomes visible
- Automatically reapplies styles
- Works for scroll-based and route-based navigation

## Version Badge Styling

**Light Mode** (lines ~151-161):
```css
.swagger-ui .info .title small {
  background-color: hsl(215, 16%, 47%) !important;  /* Gray */
  color: white !important;
}
.swagger-ui .info .title small.version-stamp {
  background-color: hsl(221, 83%, 53%) !important;  /* Blue */
}
```

**Dark Mode** (lines ~396-403):
```css
html.dark .swagger-ui .info .title small {
  background-color: #434b4f !important;  /* Dark gray */
  color: #e4e6e6 !important;
}
html.dark .swagger-ui .info .title small.version-stamp {
  background-color: #1d632e !important;  /* Dark green */
  color: white !important;
}
```

**Elements Styled**:
- **OAS 3.0 badge**: Standard badge styling (gray/dark gray)
- **1.0.0 version badge**: `.version-stamp` class (blue/dark green)

## Testing

### Manual Testing Checklist

**Light Mode**:
- [ ] Swagger UI loads with light backgrounds
- [ ] Example code sections have light gray backgrounds (`hsl(210, 20%, 99%)`)
- [ ] Text in examples is dark (`hsl(222, 47%, 11%)`)
- [ ] Version badges (1.0.0, OAS 3.0) have visible backgrounds
- [ ] Refresh page - light mode persists
- [ ] Navigate to webapp and back - light mode persists

**Dark Mode**:
- [ ] Toggle to dark mode - entire UI becomes dark
- [ ] Example code sections have dark backgrounds with syntax highlighting
- [ ] Text is light colored
- [ ] Version badges have dark backgrounds
- [ ] Refresh page - dark mode persists
- [ ] Navigate to webapp and back - dark mode persists

**Theme Toggle**:
- [ ] Click toggle - page reloads with new theme
- [ ] Theme persists across page reloads
- [ ] Cross-tab: Change theme in webapp → Swagger UI updates
- [ ] Cross-tab: Change theme in Swagger UI → webapp updates

**"Try it out" Section** (Light Mode):
- [ ] Click "Try it out" button - textarea appears with white background
- [ ] Request body textarea has dark text on white background
- [ ] Click "Execute" - response section has correct styling
- [ ] Curl command display has light background with dark text
- [ ] Response body/table has white background
- [ ] First load styling works (no need to click to trigger)

**Interactions**:
- [ ] Expand operation - code examples styled correctly
- [ ] Change example in dropdown - styles apply immediately
- [ ] Click anywhere in Swagger UI - triggers style reapplication
- [ ] MutationObserver catches dynamically added elements

### Automated Testing

**Integration Test** (proposed):
```typescript
describe('Swagger UI Theming', () => {
  it('should apply light mode styles on initial load', async () => {
    const response = await fetch('http://localhost:5000/api/docs/ui');
    const html = await response.text();
    expect(html).toContain('localStorage.getItem(\'theme\')');
    expect(html).toContain('.swagger-ui .microlight');
  });

  it('should disable syntax highlighting in light mode', async () => {
    // Mock localStorage to return 'light'
    // Check that syntaxHighlightConfig.activated === false
  });

  it('should enable syntax highlighting in dark mode', async () => {
    // Mock localStorage to return 'dark'
    // Check that syntaxHighlightConfig.activated === true
    // Check that theme === 'tomorrow-night'
  });
});
```

## Maintenance

### When Updating Swagger UI Version

1. **Test all functionality** after upgrade
2. **Check for new syntax highlighter themes** in react-syntax-highlighter
3. **Verify CSS selectors** haven't changed (especially `.microlight`, `.highlight-code`)
4. **Test IntersectionObserver** still works
5. **Review Swagger UI changelog** for theming changes

### Adding New Color Schemes

1. **Add CSS** in light/dark mode sections
2. **Update version badge colors** if needed
3. **Test with real content** (expand all operations, check examples)
4. **Verify WCAG contrast ratios** for accessibility

### Known Limitations

1. **Page reload required** for theme changes
   - Necessary to reinitialize Swagger UI with new syntax highlighting config
   - Alternative would require complex state management

2. **JavaScript dependency**
   - Without JavaScript, defaults to light mode
   - Could add `<noscript>` fallback message

3. **Performance consideration**
   - MutationObserver, IntersectionObserver and click listeners add event overhead
   - Minimal impact due to debouncing via `setTimeout` and `clearTimeout`

## Related Files

- `server/routes.ts` - Swagger UI HTML generation and theming logic
- `client/src/pages/calculator.tsx` - Webapp theme toggle (syncs with Swagger UI)
- `client/src/index.css` - Global CSS variables (not used in Swagger UI)

## References

### Swagger UI
- [Swagger UI Documentation](https://swagger.io/docs/open-source-tools/swagger-ui/)
- [Swagger UI GitHub Repository](https://github.com/swagger-api/swagger-ui)
- [Swagger UI Configuration](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/)
- [SwaggerUIBundle API](https://github.com/swagger-api/swagger-ui/blob/master/docs/usage/installation.md)

### Syntax Highlighting
- [React Syntax Highlighter Themes](https://github.com/react-syntax-highlighter/react-syntax-highlighter/blob/master/AVAILABLE_STYLES_HLJS.MD)
- [Swagger UI Syntax Highlighting Config](https://github.com/swagger-api/swagger-ui/blob/master/docs/usage/configuration.md#syntax-highlighting)

### Web APIs Used
- [MDN: MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver) - Watch for DOM changes
- [MDN: IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) - Detect visibility
- [MDN: style.setProperty()](https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleDeclaration/setProperty) - Set inline styles with priority

### CSS Specificity
- [MDN: CSS Specificity](https://developer.mozilla.org/en-US/docs/Web/CSS/Specificity)
- [MDN: !important](https://developer.mozilla.org/en-US/docs/Web/CSS/important)

## Changelog

### February 2, 2026
- **Fixed**: "Try it out" section styling not applying on first load
- **Added**: MutationObserver to catch dynamically rendered elements
- **Added**: Dual-delay pattern (50ms + 200ms) for click events
- **Added**: Secondary 500ms delay on initial load for late-rendered elements
- **Added**: Explicit styling enforcement for textarea, response sections, curl commands
- **Updated**: Documentation with MutationObserver architecture and references

### February 1, 2026
- **Initial implementation**: Complete light/dark mode theming
- **Fixed**: Dark backgrounds in light mode code examples
- **Added**: Version badge styling (1.0.0, OAS 3.0)
- **Implemented**: IntersectionObserver for SPA navigation
- **Documented**: Complete theming architecture and rationale
