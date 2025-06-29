import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/stop-end-calculator');
  // This return is technically not reached due to the redirect,
  // but Next.js expects a component to return JSX.
  return null;
}