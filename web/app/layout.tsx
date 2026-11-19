import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Drug Alert: US medicine shortages and recalls", template: "%s | Drug Alert" },
  description:
    "Check any US medicine for FDA-reported shortages and recalls, see which strengths are available, and get an email when a new recall is published.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="wrap">
            <Link href="/" className="wordmark">
              <span className="wordmark-capsule" aria-hidden="true" />
              Drug Alert
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/">Check a medicine</Link>
              <Link href="/recalls">Recent recalls</Link>
              <Link href="/watch">Email alerts</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site-footer">
          <div className="wrap">
            <p>
              Data comes from openFDA, the FDA&apos;s public data service, which the FDA says may be unvalidated. US
              medicines only.
            </p>
            <p>This is not medical advice. Talk to your pharmacist or doctor before stopping or changing any medicine.</p>
            <p>An independent project, not affiliated with or endorsed by the U.S. Food and Drug Administration.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
