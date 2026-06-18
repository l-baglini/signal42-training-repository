import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RepoWatcher',
  description:
    'Monitor GitHub/GitLab repositories with AI-powered storytelling and Claude cost tracking',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
