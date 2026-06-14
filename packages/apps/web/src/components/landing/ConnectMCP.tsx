"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

const ENDPOINT = "https://mcp.tenorfi.fi/sse";

/* ----------------------------------------------------------------------------
   ConnectMCP — tabbed "connect your client" selector for the MCP section.
   TenorFi design language: paper-raised surface, hairline --line borders,
   navy accent, font-sans copy / font-mono data. Reuses the section's
   .mcp-n number badge and .code / .copy block.
---------------------------------------------------------------------------- */

type Step = { body: ReactNode; code?: string };
type Client = { id: string; label: string; steps: Step[] };

/** Inline monospace token (file names, keys). */
function Mono({ children }: { children: ReactNode }) {
  return <code className="connect-file">{children}</code>;
}

const mcpServersConfig = `{
  "mcpServers": {
    "tenorfi": {
      "url": "${ENDPOINT}"
    }
  }
}`;

const CLIENTS: Client[] = [
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    steps: [
      { body: <>Open your <Mono>claude_desktop_config.json</Mono> file.</> },
      { body: <>Paste the TenorFi MCP endpoint configuration:</>, code: mcpServersConfig },
      {
        body: (
          <>
            Save the file and restart Claude Desktop.{" "}
            <span className="connect-accent">TenorFi</span> will appear as an
            available tool.
          </>
        ),
      },
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    steps: [
      { body: <>Open <Mono>~/.cursor/mcp.json</Mono> (or Settings → MCP → Add Server).</> },
      { body: <>Add the TenorFi server:</>, code: mcpServersConfig },
      {
        body: (
          <>
            Reload Cursor.{" "}
            <span className="connect-accent">TenorFi</span> will appear in the
            MCP tools list.
          </>
        ),
      },
    ],
  },
  {
    id: "vscode",
    label: "VS Code",
    steps: [
      { body: <>Open <Mono>.vscode/mcp.json</Mono> (or run &ldquo;MCP: Add Server&rdquo; from the Command Palette).</> },
      {
        body: <>Register the TenorFi endpoint:</>,
        code: `{
  "servers": {
    "tenorfi": {
      "type": "sse",
      "url": "${ENDPOINT}"
    }
  }
}`,
      },
      {
        body: (
          <>
            Start it from the MCP view —{" "}
            <span className="connect-accent">TenorFi</span> tools become
            available to Copilot.
          </>
        ),
      },
    ],
  },
  {
    id: "zed",
    label: "Zed",
    steps: [
      { body: <>Open Zed&rsquo;s <Mono>settings.json</Mono>.</> },
      {
        body: <>Add TenorFi under <Mono>context_servers</Mono>:</>,
        code: `{
  "context_servers": {
    "tenorfi": {
      "url": "${ENDPOINT}"
    }
  }
}`,
      },
      {
        body: (
          <>
            Restart Zed.{" "}
            <span className="connect-accent">TenorFi</span> will appear in the
            assistant&rsquo;s tool list.
          </>
        ),
      },
    ],
  },
  {
    id: "windsurf",
    label: "Windsurf",
    steps: [
      { body: <>Open <Mono>~/.codeium/windsurf/mcp_config.json</Mono> (or Settings → Cascade → MCP).</> },
      { body: <>Add the TenorFi server:</>, code: mcpServersConfig },
      {
        body: (
          <>
            Click &ldquo;Refresh&rdquo; in the MCP panel.{" "}
            <span className="connect-accent">TenorFi</span> will appear as an
            available tool.
          </>
        ),
      },
    ],
  },
];

/* ---- copyable code / endpoint block (reuses .code / .copy) ---- */
function CodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="code" style={{ marginTop: 12 }}>
      <button type="button" className="copy" onClick={copy} aria-label="Copy to clipboard">
        {copied ? "✓ Copied" : "Copy"}
      </button>
      <pre>{code}</pre>
    </div>
  );
}

/* ---- chevron icons ---- */
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ConnectMCP() {
  const [activeId, setActiveId] = useState(CLIENTS[0].id);
  const active = CLIENTS.find((c) => c.id === activeId) ?? CLIENTS[0];

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState({ left: false, right: false });

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setArrows({
      left: scrollLeft > 2,
      right: scrollLeft + clientWidth < scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows]);

  const nudge = (dir: number) =>
    scrollerRef.current?.scrollBy({ left: dir * 160, behavior: "smooth" });

  return (
    <div className="connect">
      {/* ---- Tabbed navigation header ---- */}
      <div className="connect-tabhead">
        {arrows.left && (
          <button
            type="button"
            className="connect-arrow l"
            onClick={() => nudge(-1)}
            aria-label="Scroll tabs left"
          >
            <Chevron dir="left" />
          </button>
        )}

        <div ref={scrollerRef} className="connect-tabs">
          {CLIENTS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={`connect-tab${c.id === activeId ? " on" : ""}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {arrows.right && (
          <button
            type="button"
            className="connect-arrow r"
            onClick={() => nudge(1)}
            aria-label="Scroll tabs right"
          >
            <Chevron dir="right" />
          </button>
        )}
      </div>

      {/* ---- Tab content: numbered steps ---- */}
      <div className="connect-body">
        <ol key={active.id} className="connect-steps">
          {active.steps.map((step, i) => (
            <li key={i} className="connect-step">
              <span className="mcp-n">{i + 1}</span>
              <div className="txt">
                <p>{step.body}</p>
                {step.code && <CodeBox code={step.code} />}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
