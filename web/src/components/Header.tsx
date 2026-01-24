import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 text-sm font-semibold">
        <Link className="text-slate-100 hover:text-sky-300" to="/">
          Home
        </Link>
        <Link className="text-slate-100 hover:text-sky-300" to="/library">
          Library
        </Link>
      </nav>
    </header>
  )
}
