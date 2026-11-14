import { PAGE, PageTitle, TopBar, primaryButton } from "@/components/solvo/ui";

export const metadata = { title: "Offline · Solvo" };

// Shown by the service worker (public/sw.js) when a page can't load without a connection. Static: it is stored on the phone.
export default function OfflinePage() {
  return (
    <main className={PAGE}>
      <TopBar />
      <PageTitle title="You're offline">Solvo needs a connection to show your numbers. Check your signal or Wi-Fi, then try again.</PageTitle>
      {/* A plain link on purpose: it makes a full page load, which is what we want after the connection is back. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className={primaryButton}>
        Try again
      </a>
    </main>
  );
}
