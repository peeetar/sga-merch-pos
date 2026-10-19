import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in · SGA Hub" };

const ERRORS: Record<string, string> = {
  link: "That link has expired or was already used. Ask for a new one.",
  not_on_board: "That email isn't on this year's board list.",
  server: "Something went wrong on the server. Try again in a minute.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentSession()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="center center--brand">
      <div className="card card--narrow">
        <p className="brand brand--big"><span className="brand__mark">SGA</span> Hub</p>
        <LoginForm initialError={error ? ERRORS[error] || null : null} passwordEnabled={!!process.env.HUB_PASSWORD} />
      </div>
    </main>
  );
}
