import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-5xl font-semibold text-faint">404</p>
        <p className="mt-2 text-muted">That page does not exist.</p>
        <Link href="/" className="mt-4 inline-block text-accent hover:underline">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
