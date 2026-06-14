"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BackgroundGradient } from "@/components/ui/background-gradient";

export default function Header() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="nav">
      <Link
        className="brand"
        href="/"
        style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
      >
        <Image
          src="/tenorfi-logo.png"
          alt="TenorFi"
          width={500}
          height={500}
          priority
          className="brand-logo"
          style={{ height: 30, width: "auto", flex: "none" }}
        />
        <span style={{ lineHeight: 1 }}>TenorFi</span>
      </Link>

      <div className="nav-links">
        <Link href="/" className={`hide-sm ${isActive("/") ? "active" : ""}`}>
          Product
        </Link>
        <Link href="/explorer" className={isActive("/explorer") ? "active" : ""}>
          Explorer
        </Link>
        <a href="/#how" className="hide-sm">
          How it works
        </a>
        <a href="/#pricing" className="hide-sm">
          Pricing
        </a>
        <a href="/#faq" className="hide-sm">
          FAQ
        </a>
      </div>

      <div className="flex items-center gap-2.5">
        <BackgroundGradient containerClassName="rounded-full" className="rounded-full">
          <Link href="/create-position" className="btn btn-primary btn-sm">
            Create a position
          </Link>
        </BackgroundGradient>
      </div>

      <style jsx>{`
        .nav {
          position: sticky;
          top: 16px;
          z-index: 50;
          width: calc(100% - 32px);
          max-width: 1180px;
          margin: 16px auto 0;
          height: 60px;
          padding: 0 12px 0 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(250, 247, 240, 0.72);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--line);
          border-radius: var(--r-pill);
          box-shadow: var(--sh-sm);
        }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .nav-links :global(a) {
          padding: 8px 14px;
          border-radius: var(--r-pill);
          font-size: 14.5px;
          font-weight: 500;
          color: var(--fg-secondary);
          transition: color var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
        }
        .nav-links :global(a:hover) {
          color: var(--fg-primary);
          background: var(--paper-2);
        }
        .nav-links :global(a.active) {
          color: var(--navy);
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 11px;
          font-family: var(--f-display);
          font-weight: 800;
          font-size: 20px;
          letter-spacing: -0.03em;
          color: var(--fg-primary);
        }
        .brand :global(.brand-logo) {
          height: 30px;
          width: auto;
          max-height: 30px;
        }
        @media (max-width: 640px) {
          .nav-links :global(a.hide-sm) {
            display: none;
          }
        }
      `}</style>
    </nav>
  );
}
