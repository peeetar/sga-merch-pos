import KioskTabs from "./KioskTabs";

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <KioskTabs />
      {children}
    </>
  );
}
