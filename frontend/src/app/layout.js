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
        {/* Background Animation Removed for Minimalist Look */}

        {/* Navigation */}
        <nav className="navbar">
          <div className="container flex items-center justify-between">
            <Link href="/" style={{ textDecoration: 'none' }}>
              <h2 className="text-gradient">SemanticSearch</h2>
            </Link>
            <div className="nav-links">
              <Link href="/" className="nav-link">Search</Link>
              <Link href="/dashboard" className="nav-link">Dashboard</Link>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main style={{ padding: '2rem 0' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
