import { Instrument_Sans } from 'next/font/google';
import './globals.css';

// Instrument Sans rather than the Geist that create-next-app installed. Geist
// is the Next.js default and reads as one; this is slightly narrower with more
// drawn detail in the lowercase, which suits small equipment labels sitting
// over a render. One family throughout — there is no long-form text here for a
// second face to earn its place against.
const instrument = Instrument_Sans({
  variable: '--font-instrument',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'Avatar',
  description: 'A VRM companion for an AI agent.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${instrument.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
