import { BackLink, PAGE, PageTitle, TopBar } from "@/components/solvo/ui";
import { InstallGuide } from "@/components/install-guide";

export const metadata = { title: "Put Solvo on your phone · Solvo" };

// Static page: the steps depend on the phone, which only the browser knows, so InstallGuide decides on the phone.
export default function InstallPage() {
  return (
    <main className={PAGE}>
      <TopBar back={<BackLink href="/profile" label="Profile" />} />
      <PageTitle title="Put Solvo on your phone">
        Solvo installs from the browser. No app store, nothing to download. It opens full screen like an app.
      </PageTitle>
      <InstallGuide />
    </main>
  );
}
