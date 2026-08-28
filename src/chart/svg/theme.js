const THEMES = {
  light: {
    bg: '#ffffff',
    border: '#e0e0e0',
    grid: '#f0f0f0',
    axis: '#c0c0c0',
    axisText: '#5f6368',
    titleText: '#1c1b1f',
    line: '#1a73e8',
    gradTop: '#1a73e8',
    gradBot: '#ffffff',
    dot: '#1a73e8',
    pillBg: '#e8f0fe',
    pillBorder: '#1a73e8',
    pillText: '#1c1b1f',
  },
  dark: {
    bg: '#1e1e2e',
    border: '#313244',
    grid: '#2a2a3e',
    axis: '#45475a',
    axisText: '#a6adc8',
    titleText: '#cdd6f4',
    line: '#89b4fa',
    gradTop: '#89b4fa',
    gradBot: '#1e1e2e',
    dot: '#89b4fa',
    pillBg: '#1e3a5f',
    pillBorder: '#89b4fa',
    pillText: '#cdd6f4',
  },
};

function getTheme(themeName) {
  return THEMES[themeName] || THEMES.light;
}

module.exports = {
  getTheme,
};
