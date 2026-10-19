// Landing page for the emailed link. It signs in only when the button is
// pressed; see app/api/auth/verify for why.
export const metadata = { title: "Sign in · SGA Hub" };

export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="center center--brand">
      <div className="card card--narrow">
        <p className="brand brand--big"><span className="brand__mark">SGA</span> Hub</p>
        {token ? (
          <form method="post" action="/api/auth/verify" className="stack">
            <input type="hidden" name="token" value={token} />
            <p className="muted">One tap and you&apos;re in. This device stays signed in for 30 days.</p>
            <button className="btn btn--primary">Sign in</button>
          </form>
        ) : (
          <p className="muted">This link is missing its code. Ask for a new one on the <a href="/login">sign-in page</a>.</p>
        )}
      </div>
    </main>
  );
}
