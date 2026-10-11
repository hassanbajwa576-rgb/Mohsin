import { Montserrat } from 'next/font/google';
import './globals.css';

const font = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' });

export const metadata = {
  title: 'PettyTrack - AlphaBOLD',
  description: 'PettyTrack: Expense Management | Pakistan Office',
  applicationName: 'PettyTrack',
  appleWebApp: { capable: true, title: 'PettyTrack', statusBarStyle: 'default' },
  icons: { icon: '/icons/192', apple: '/icons/180' },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#e3ad21' };

export default function RootLayout({ children }) {
  return (
    <html lang='en'>
      <body className={font.className}>{children}</body>
    </html>
  );
}
