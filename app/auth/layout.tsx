// Auth pages access Firebase Auth on the client — disable prerendering so
// Next.js doesn't try to run Firebase during static page data collection.
export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
