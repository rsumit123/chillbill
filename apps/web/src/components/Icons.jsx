export function Icon({ id = 'group', size = 16, className = '' }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', className }
  switch (id) {
    case 'trip':
      return (
        <svg {...props}><path d="M10.18 9" fill="none"/><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 1 0-3 0V9L2 14v2l8-2.5V19l-2 1.5V22l3-1 3 1v-1.5L13 19v-5.5L21 16z"/></svg>
      )
    case 'home':
      return (
        <svg {...props}><path d="M12 3 2 12h3v9h6v-6h2v6h6v-9h3L12 3z"/></svg>
      )
    case 'event':
      return (
        <svg {...props}><path d="M7 2v2H5a2 2 0 0 0-2 2v2h18V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zm14 8H3v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10zM7 14h4v4H7v-4z"/></svg>
      )
    case 'food':
      return (
        <svg {...props}><path d="M7 2v8a2 2 0 0 1-2 2v10h2V12h2v10h2V12a2 2 0 0 1-2-2V2H7zm9 0a3 3 0 0 0-3 3v7h2v12h2V12h2V5a3 3 0 0 0-3-3z"/></svg>
      )
    case 'work':
      return (
        <svg {...props}><path d="M9 3h6a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v3H2V8a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2zm0 3V5h6v1H9zM2 13h22v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7z"/></svg>
      )
    case 'group':
    default:
      return (
        <svg {...props}><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-5 0-10 2.5-10 6v2h20v-2c0-3.5-5-6-10-6z"/></svg>
      )
  }
}


