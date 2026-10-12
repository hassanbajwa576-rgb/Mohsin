import { Montserrat, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { getLang } from '@/lib/lang';
import Translator from '@/components/Translator';

const font = Montserrat({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' });
const urFont = Noto_Sans_Arabic({ subsets: ['arabic'], variable: '--font-ur', display: 'swap' });

export const metadata = {
  title: 'PettyTrack - AlphaBOLD',
  description: 'PettyTrack: Expense Management | Pakistan Office',
  applicationName: 'PettyTrack',
  appleWebApp: { capable: true, title: 'PettyTrack', statusBarStyle: 'default' },
  icons: { icon: '/icons/192', apple: '/icons/180' },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#e3ad21' };

export default async function RootLayout({ children }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={lang === 'ur' ? 'rtl' : 'ltr'}>
      <body className={font.className + ' ' + urFont.variable}>
        {lang === 'ur' ? <Translator /> : null}
        {children}
      </body>
    </html>
  );
}
