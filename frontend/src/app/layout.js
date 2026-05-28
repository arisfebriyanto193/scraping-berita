import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Semantic News Search',
  description: 'AI-Powered News Search Engine',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav className="navbar">
          <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <h2 className="text-gradient" style={{ fontSize: 'clamp(1rem, 3vw, 1.3rem)' }}>SemanticSearch</h2>
            </Link>

          </div>
        </nav>

        <main style={{ padding: '1rem 0 3rem' }}>
          {children}
        </main>
      </body>
    </html>
  );
}

