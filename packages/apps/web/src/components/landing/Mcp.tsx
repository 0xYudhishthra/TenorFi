"use client";

import { useState } from "react";
import Reveal from "./Reveal";
import ConnectMCP from "./ConnectMCP";

const METHODS = [
  {
    label: "Read · free",
    tools: [
      ["get_funding", "live funding rate (AFR) via Chainlink CRE"],
      ["list_offers", "the reserve's standing fixed-rate quotes"],
      ["get_position", "your open swaps + collateral health"],
      ["preview_settle", "what this period would net at the current rate"],
    ],
  },
  {
    label: "Open · you sign",
    tools: [
      ["open_hyperliquid_position", "the perp leg, via the Hyperliquid API"],
      ["open_tenorfi_position", "ship the swap leg into 1inch Aqua"],
    ],
  },
  {
    label: "Settle · keeper",
    tools: [
      ["settle", "net fixed-vs-floating for the period in USDC"],
      ["topup_hyperliquid_margin", "route an AFR > FFR payout to your margin"],
    ],
  },
  {
    label: "Brink · you confirm",
    tools: [["propose_decision", "unsigned close / re-match / continue tx"]],
  },
];

const ASKS = [
  "What's BTC funding right now, and what fixed rate can I lock?",
  "Long BTC $5k and fix my funding rate.",
  "Show my open positions and their collateral health.",
  "Preview this hour's settlement at the current funding rate.",
  "My collateral is running low — what are my options?",
];

const FAQ = [
  {
    q: "Does the agent move my money on its own?",
    a: "No. The MCP only builds transactions — you sign every one. The brink call (propose_decision) returns an unsigned close / re-match / continue tx for you to confirm. There's no AI in the settlement math, so there's no place for a hallucination to move funds.",
  },
  {
    q: "Which clients can connect?",
    a: "Anything that speaks MCP — Claude Code, Claude Desktop, Cursor, Cline, Codex. The TenorFi server runs locally over stdio, so your keys and signatures never leave your machine.",
  },
  {
    q: "What can it read vs. write?",
    a: "Reads are free and unsigned (get_funding, list_offers, get_position, preview_settle). Opening both legs and the brink decision are user-signed; the per-period settle is a routine keeper/CRE-triggered call over TenorFiSwapVMRouter.",
  },
  {
    q: "Can I trust the funding number it settles on?",
    a: "It's Chainlink CRE: Hyperliquid funding → DON consensus → an on-chain funding index. The contract settles against that public number; the MCP just reads it. The opcode caps each period and collateral is pre-locked, so no default is possible.",
  },
];

function AskRow({ q }: { q: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ask">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="q">{q}</span>
      <button
        type="button"
        className={`ask-copy${copied ? " done" : ""}`}
        aria-label="Copy question"
        title="Copy question"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(q);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        {copied ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Copied
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Copy
          </>
        )}
      </button>
    </div>
  );
}

export default function Mcp() {
  return (
    <section className="section" id="mcp" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <Reveal>
          <div className="shead">
            <span className="eyebrow">Developers · Model Context Protocol</span>
            <h2 className="display">
              Drive TenorFi from <em className="flat">your agent.</em>
            </h2>
            <p className="lead" style={{ marginTop: 18, maxWidth: "54ch" }}>
              The <b>TenorFi MCP</b> is the front door. Point any MCP client — Claude,
              Cursor, Cline — at it, and you lock a funding rate in one conversation.
              The agent reads funding, lists offers and builds both legs of the hedge;
              the signature that moves money is always yours.{" "}
              <em className="flat">Agent proposes, you confirm.</em>
            </p>
          </div>
        </Reveal>

        <div className="mcp-grid">
          {/* ---- Server + methods ---- */}
          <Reveal className="mcp-endpoint">
            <div
              className="ticket-glow"
              style={{ inset: "auto auto -60% -30%", width: "70%", height: "120%" }}
            />
            <div className="k">MCP server · TenorFi</div>
            <div className="url">node packages/mcp/dist/index.js</div>
            <div className="mcp-tags">
              <span className="mcp-tag">
                <span className="dot" />
                Local · stdio
              </span>
              <span className="mcp-tag">8 tools</span>
              <span className="mcp-tag">Agent proposes · you confirm</span>
            </div>

            <div className="mcp-methods">
              {METHODS.map((g) => (
                <div className="mcp-mgroup" key={g.label}>
                  <span className="mcp-mlabel">{g.label}</span>
                  {g.tools.map(([name, desc]) => (
                    <div className="mcp-tool" key={name}>
                      <code>{name}</code>
                      <span>— {desc}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <p className="mcp-note">
              Built on{" "}
              <span className="mono">@modelcontextprotocol/sdk</span>; the contract
              settles in real USDC on Base mainnet. The MCP never custodies — it just
              reads and proposes.
            </p>
          </Reveal>

          {/* ---- How to connect (tabbed per-client selector) ---- */}
          <Reveal delay={0.08}>
            <ConnectMCP />
          </Reveal>
        </div>

        {/* ---- What to ask ---- */}
        <Reveal>
          <div style={{ marginTop: 36 }}>
            <span className="eyebrow">What to ask</span>
            <div className="mcp-asks">
              {ASKS.map((q) => (
                <AskRow q={q} key={q} />
              ))}
            </div>
          </div>
        </Reveal>

        {/* ---- MCP FAQ ---- */}
        <Reveal>
          <div style={{ marginTop: 40 }}>
            <span className="eyebrow">MCP FAQ</span>
            <div className="faq" style={{ marginTop: 16 }}>
              {FAQ.map((item, i) => (
                <details className="qa" key={item.q} open={i === 0}>
                  <summary>
                    {item.q}
                    <svg className="chev" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </summary>
                  <div className="ans">{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
