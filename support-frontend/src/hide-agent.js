// hide-agent.js
// Purpose: Hide any "Agent" dropdown on the page without touching your component code.
// How it works: Looks for labels that contain the word "Agent" or selects named "agent" and hides them.

function hideAgentDropdownsOnce(scope = document) {
  try {
    // 1) Hide selects directly identifiable as "agent"
    const directSelectors = [
      'select[name="agent"]',
      'select#agent',
      'select[data-field="agent"]',
      'select[aria-label="Agent"]'
    ];
    directSelectors.forEach(sel => {
      scope.querySelectorAll(sel).forEach(el => {
        el.style.display = 'none';
        const label = scope.querySelector(`label[for="${el.id}"]`);
        if (label) label.style.display = 'none';
      });
    });

    // 2) Hide by associated label text
    const labels = Array.from(scope.querySelectorAll('label'));
    labels.forEach(label => {
      const text = (label.textContent || '').trim().toLowerCase();
      if (!text) return;
      if (text === 'agent' || text.includes('agent')) {
        // Try to hide the control this label is for
        let control = label.htmlFor ? scope.getElementById(label.htmlFor) : null;
        if (!control) control = label.querySelector('select');
        if (!control) control = label.parentElement && label.parentElement.querySelector && label.parentElement.querySelector('select');
        if (control && control.tagName && control.tagName.toLowerCase() === 'select') {
          control.style.display = 'none';
          label.style.display = 'none';
          // Optional helper text so users know what's going on
          const info = document.createElement('div');
          info.textContent = 'Author: your logged-in user (set automatically)';
          info.style.opacity = '0.8';
          info.style.fontSize = '0.9rem';
          if (control.parentElement) {
            control.parentElement.appendChild(info);
          } else if (label.parentElement) {
            label.parentElement.appendChild(info);
          }
        }
      }
    });
  } catch (e) {
    // non-fatal
    console.warn('hide-agent.js: ', e);
  }
}

// Run on initial load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => hideAgentDropdownsOnce());
} else {
  hideAgentDropdownsOnce();
}

// Also observe for content rendered later (e.g., drawer opens)
const mo = new MutationObserver((muts) => {
  // Debounce: run once after batch
  if (hideAgentDropdownsOnce._t) cancelAnimationFrame(hideAgentDropdownsOnce._t);
  hideAgentDropdownsOnce._t = requestAnimationFrame(() => hideAgentDropdownsOnce());
});
mo.observe(document.documentElement, { childList: true, subtree: true });
