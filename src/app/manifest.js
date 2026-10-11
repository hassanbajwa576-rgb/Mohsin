// Web app manifest so PettyTrack can be installed on a phone home screen.
export default function manifest() {
  return {
    name: 'PettyTrack - AlphaBOLD',
    short_name: 'PettyTrack',
    description: 'Expense Management | Pakistan Office',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#e3ad21',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
