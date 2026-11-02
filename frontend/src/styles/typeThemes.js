export const TYPE_THEMES = {
  instrument: {
    display: '"IBM Plex Sans Condensed", system-ui, sans-serif',
    ui: '"IBM Plex Sans", system-ui, sans-serif',
    data: '"IBM Plex Mono", ui-monospace, monospace',
  },
  marquee: {
    display: '"Space Grotesk", system-ui, sans-serif',
    ui: '"Inter", system-ui, sans-serif',
    data: '"JetBrains Mono", ui-monospace, monospace',
  },
  station: {
    display: '"Schibsted Grotesk", system-ui, sans-serif',
    ui: '"Schibsted Grotesk", system-ui, sans-serif',
    data: '"JetBrains Mono", ui-monospace, monospace',
  },
};

export const DEFAULT_TYPE_THEME = "instrument";

export const isTypeTheme = id => Object.prototype.hasOwnProperty.call(TYPE_THEMES, id);
