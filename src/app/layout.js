import { Montserrat } from 'next/font/google';
import './globals.css';

const font = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' });

export const metadata = {
  title: 'PettyTrack - AlphaBOLD',
  description: 'PettyTrack: Expense Management | Pakistan Office',
};
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang='en'>
      <body className={font.className}>{children}</body>
    </html>
  );
}
