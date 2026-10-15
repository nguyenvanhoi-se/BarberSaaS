import { Link } from "react-router-dom";
import type { UserRole } from "../../shared/auth";
import { useAuth } from "../auth/AuthContext";
import { ImageUpload } from "../components/ImageUpload";
import { Image } from "../components/Image";

export function AccountPage({ title, roles }: { title: string; roles?: UserRole[] }) {
  const { currentUser, logout, refresh } = useAuth();
  return <main className="min-h-screen bg-neutral-950 p-8 text-neutral-100"><h1 className="text-3xl">{title}</h1><p className="mt-3">{currentUser?.name} · {currentUser?.role}</p>{currentUser&&<div className="mt-6 max-w-lg"><ImageUpload kind="user_avatar" currentUrl={currentUser.avatar_url} label="Profile avatar" onChange={()=>void refresh()}/><Image src={currentUser.avatar_url} alt="Current profile avatar" className="account-avatar"/></div>}{roles && <p className="mt-2 text-neutral-400">Access: {roles.join(", ")}</p>}
    <button className="mt-6 rounded bg-amber-500 px-4 py-2 text-neutral-950" onClick={() => void logout()}>Sign out</button><Link to="/" className="ml-4 text-amber-400">Shop home</Link></main>;
}

export function ForbiddenPage() { return <main className="flex min-h-screen items-center justify-center bg-[var(--primary-color)] p-12 text-white"><div><h1 className="font-display text-4xl">403 · Access denied</h1><Link to="/" className="mt-5 inline-block text-[var(--accent-color)]">Shop home</Link></div></main>; }
