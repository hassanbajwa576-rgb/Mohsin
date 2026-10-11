import './globals.css';

export const metadata = { title: 'Petty Cash - LHR & ISB', description: 'Office expense management for the LHR and ISB offices' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  );
}
