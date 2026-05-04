import type { Metadata } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const headingFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-heading',
});

const bodyFont = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'WeTeams Admin',
  description: 'Frontend admin console for WeTeams tenants',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: import('react').ReactNode;
}>) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body className="font-body min-h-screen">
        {children}
        <Toaster richColors position="top-right" closeButton expand />
      </body>
    </html>
  );
}
