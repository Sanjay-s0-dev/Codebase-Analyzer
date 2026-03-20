import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8000";

// ── Mermaid loader ────────────────────────────────────────────────────────────
function useMermaid() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.mermaid) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.6.1/mermaid.min.js";
    s.onload = () => { window.mermaid.initialize({ startOnLoad: false, theme: "dark" }); setReady(true); };
    document.head.appendChild(s);
  }, []);
  return ready;
}

// ── Severity colors ───────────────────────────────────────────────────────────
const SEV = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score, label, size = 120 }) {
  const r = 44, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dasharray 1s ease" }} />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central"
          fill="#f1f5f9" fontSize="18" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
          {score}
        </text>
      </svg>
      <span style={{ color: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}>{label}</span>
    </div>
  );
}

// ── Sub score bar ─────────────────────────────────────────────────────────────
function ScoreBar({ label, value, max = 20 }) {
  const pct = (value / max) * 100;
  const color = pct >= 80 ? "#22c55e" : pct >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}>{label}</span>
        <span style={{ color, fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>{value}/{max}</span>
      </div>
      <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

// ── File tree ─────────────────────────────────────────────────────────────────
function FileTree({ files }) {
  const [open, setOpen] = useState({});
  // Build tree structure from flat file list
  const tree = {};
  files.forEach(f => {
    const parts = f.path.split("/");
    let node = tree;
    parts.forEach((p, i) => {
      if (!node[p]) node[p] = i === parts.length - 1 ? { __file: f } : {};
      node = node[p];
    });
  });

  function Node({ name, node, depth = 0 }) {
    const isFile = node.__file;
    const key = name + depth;
    const children = isFile ? [] : Object.entries(node);
    const hasChildren = children.length > 0;
    const isOpen = open[key];

    return (
      <div style={{ paddingLeft: depth * 14 }}>
        <div onClick={() => !isFile && setOpen(o => ({ ...o, [key]: !o[key] }))}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px",
            borderRadius: 4, cursor: isFile ? "default" : "pointer", color: isFile ? "#94a3b8" : "#e2e8f0",
            fontSize: 12, fontFamily: "monospace",
            background: isFile ? "transparent" : "transparent",
            "&:hover": { background: "#1e293b" } }}>
          <span style={{ opacity: 0.6 }}>
            {isFile ? "📄" : isOpen ? "📂" : "📁"}
          </span>
          <span>{name}</span>
          {isFile && (
            <span style={{ marginLeft: "auto", color: "#475569", fontSize: 11 }}>
              {node.__file.lines} lines
            </span>
          )}
        </div>
        {!isFile && isOpen && children.map(([k, v]) => (
          <Node key={k} name={k} node={v} depth={depth + 1} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ background: "#0f172a", borderRadius: 8, padding: 12, maxHeight: 320, overflowY: "auto" }}>
      {Object.entries(tree).map(([k, v]) => <Node key={k} name={k} node={v} />)}
    </div>
  );
}

// ── Mermaid diagram ───────────────────────────────────────────────────────────
function ArchDiagram({ pattern, stack }) {
  const ref = useRef(null);
  const mermaidReady = useMermaid();

  const langs = stack?.languages?.slice(0, 3) || [];
  const frameworks = stack?.frameworks?.slice(0, 4) || [];

  const diagram = `graph TD
    A[Client] --> B[API Layer]
    B --> C[${(pattern || "Core").replace(/[|]/g, " / ")}]
    ${langs.map((l, i) => `C --> L${i}[${l}]`).join("\n    ")}
    ${frameworks.map((f, i) => `C --> F${i}[${f}]`).join("\n    ")}`;

  useEffect(() => {
    if (!mermaidReady || !ref.current) return;
    ref.current.innerHTML = diagram;
    ref.current.removeAttribute("data-processed");
    try { window.mermaid.run({ nodes: [ref.current] }); } catch (e) {}
  }, [mermaidReady, diagram]);

  return (
    <div ref={ref} className="mermaid"
      style={{ background: "#0f172a", borderRadius: 8, padding: 16, overflowX: "auto", minHeight: 120 }}>
      {!mermaidReady && <span style={{ color: "#475569", fontSize: 12 }}>Loading diagram...</span>}
    </div>
  );
}

// ── Comparison card ───────────────────────────────────────────────────────────
function CompareView({ repos }) {
  if (repos.length < 2) return (
    <div style={{ color: "#475569", fontSize: 13, textAlign: "center", padding: 32 }}>
      Analyze at least 2 repos to compare
    </div>
  );
  const cats = ["file_organization", "naming_conventions", "error_handling", "documentation", "complexity"];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "monospace" }}>
        <thead>
          <tr>
            <th style={{ color: "#475569", textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #1e293b" }}>Category</th>
            {repos.map(r => (
              <th key={r.job_id} style={{ color: "#94a3b8", textAlign: "center", padding: "8px 12px", borderBottom: "1px solid #1e293b" }}>
                {r.result?.repo || r.repo_url.split("/").pop()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cats.map(cat => (
            <tr key={cat}>
              <td style={{ color: "#64748b", padding: "7px 12px", borderBottom: "1px solid #0f172a" }}>
                {cat.replace(/_/g, " ")}
              </td>
              {repos.map(r => {
                const val = r.result?.analysis?.code_quality?.[cat] ?? "-";
                const color = val >= 16 ? "#22c55e" : val >= 12 ? "#f59e0b" : "#ef4444";
                return (
                  <td key={r.job_id} style={{ textAlign: "center", padding: "7px 12px",
                    borderBottom: "1px solid #0f172a", color, fontWeight: 700 }}>
                    {val}/20
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td style={{ color: "#e2e8f0", padding: "10px 12px", fontWeight: 700 }}>Overall</td>
            {repos.map(r => {
              const score = r.result?.analysis?.code_quality?.overall_score ?? "-";
              const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
              return (
                <td key={r.job_id} style={{ textAlign: "center", padding: "10px 12px", color, fontWeight: 700, fontSize: 14 }}>
                  {score}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function App() {
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("analysis"); // analysis | compare
  const [compareRepos, setCompareRepos] = useState([]);
  const pollRef = useRef(null);

  // Load history on mount
  useEffect(() => {
    fetch(`${API}/history`).then(r => r.json()).then(setHistory).catch(() => {});
  }, []);

  // Poll for result
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      const r = await fetch(`${API}/analysis/${jobId}`).then(r => r.json());
      setStatus(r.status);
      if (r.status === "completed") {
        setResult(r);
        setLoading(false);
        clearInterval(pollRef.current);
        fetch(`${API}/history`).then(r => r.json()).then(setHistory).catch(() => {});
      } else if (r.status === "failed") {
        setError(r.error);
        setLoading(false);
        clearInterval(pollRef.current);
      }
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  async function analyze() {
    if (!url.trim()) return;
    setLoading(true); setError(null); setResult(null); setStatus("pending");
    try {
      const r = await fetch(`${API}/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: url })
      }).then(r => r.json());
      setJobId(r.job_id);
      if (r.status === "completed") {
        const full = await fetch(`${API}/analysis/${r.job_id}`).then(r => r.json());
        setResult(full); setLoading(false); setStatus("completed");
      }
    } catch (e) { setError("Could not reach the API. Is uvicorn running?"); setLoading(false); }
  }

  function addToCompare(repo) {
    if (compareRepos.find(r => r.job_id === repo.job_id)) return;
    setCompareRepos(p => [...p.slice(-2), repo]);
  }

  const analysis = result?.result?.analysis;
  const quality  = analysis?.code_quality;
  const files    = result?.result?.files || [];

  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#e2e8f0", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e293b", padding: "16px 32px", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: "#38bdf8", letterSpacing: -1 }}>repo-insight</span>
        <span style={{ color: "#334155", fontSize: 12 }}>/ ai code analyzer</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {["analysis", "compare"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ background: tab === t ? "#1e293b" : "transparent", border: "1px solid",
                borderColor: tab === t ? "#38bdf8" : "#1e293b", color: tab === t ? "#38bdf8" : "#475569",
                borderRadius: 6, padding: "5px 14px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>

        {/* Input */}
        <div style={{ display: "flex", gap: 10, marginBottom: 32 }}>
          <input value={url} onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && analyze()}
            placeholder="https://github.com/owner/repo"
            style={{ flex: 1, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8,
              padding: "10px 16px", color: "#e2e8f0", fontSize: 13, fontFamily: "inherit",
              outline: "none" }} />
          <button onClick={analyze} disabled={loading}
            style={{ background: loading ? "#1e293b" : "#38bdf8", color: loading ? "#475569" : "#020617",
              border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 13,
              fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
              transition: "all 0.2s" }}>
            {loading ? `${status}...` : "Analyze"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#1e0a0a", border: "1px solid #7f1d1d", borderRadius: 8,
            padding: "12px 16px", color: "#fca5a5", fontSize: 12, marginBottom: 24 }}>
            {error}
          </div>
        )}

        {/* Analysis tab */}
        {tab === "analysis" && analysis && (
          <div style={{ display: "grid", gap: 20 }}>

            {/* Top row: score + stack */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

              {/* Quality scores */}
              <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>Code Quality</div>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                  <ScoreRing score={
                  (() => {
                  const cats = ["file_organization","naming_conventions","error_handling","documentation","complexity"];
                  const sum = cats.reduce((acc, k) => acc + (quality?.[k] || 0), 0);
                  return sum > 0 ? sum : (quality?.overall_score || 0);
                 })()
                 } label="overall" size={130} />
                </div>
                {["file_organization","naming_conventions","error_handling","documentation","complexity"].map(k => (
                  <ScoreBar key={k} label={k.replace(/_/g," ")} value={quality?.[k] || 0} />
                ))}
                {quality?.rationale && (
                  <p style={{ color: "#64748b", fontSize: 11, marginTop: 12, lineHeight: 1.6, borderTop: "1px solid #1e293b", paddingTop: 12 }}>
                    {quality.rationale}
                  </p>
                )}
              </div>

              {/* Tech stack + arch */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Tech Stack</div>
                  {[["Languages", analysis.tech_stack?.languages], ["Frameworks", analysis.tech_stack?.frameworks], ["Libraries", analysis.tech_stack?.libraries]].map(([label, items]) =>
                    items?.length > 0 && (
                      <div key={label} style={{ marginBottom: 10 }}>
                        <div style={{ color: "#475569", fontSize: 11, marginBottom: 6 }}>{label}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {items.map(i => (
                            <span key={i} style={{ background: "#1e293b", color: "#38bdf8", borderRadius: 4,
                              padding: "2px 10px", fontSize: 11 }}>{i}</span>
                          ))}
                        </div>
                      </div>
                    )
                  )}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ color: "#475569", fontSize: 11, marginBottom: 6 }}>Architecture</div>
                    <span style={{ background: "#172554", color: "#93c5fd", borderRadius: 4, padding: "3px 12px", fontSize: 11 }}>
                      {analysis.architecture_pattern}
                    </span>
                  </div>
                </div>

                {/* Metadata */}
                <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Metadata</div>
                  {[
                    ["Files analyzed", result.metadata?.file_count],
                    ["Total lines", result.metadata?.total_lines],
                    ["Analysis time", `${result.metadata?.analysis_time_seconds}s`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ color: "#475569", fontSize: 12 }}>{k}</span>
                      <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>{v}</span>
                    </div>
                  ))}
                </div>

                <button onClick={() => addToCompare(result)}
                  style={{ background: "#172554", border: "1px solid #1e40af", color: "#93c5fd",
                    borderRadius: 8, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  + Add to compare
                </button>
              </div>
            </div>

            {/* Architecture diagram */}
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>Architecture Diagram</div>
              <ArchDiagram pattern={analysis.architecture_pattern} stack={analysis.tech_stack} />
            </div>

            {/* Summary */}
            {analysis.summary && (
              <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Summary</div>
                <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.7, margin: 0 }}>{analysis.summary}</p>
              </div>
            )}

            {/* File tree */}
            {files.length > 0 && (
              <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>File Tree</div>
                <FileTree files={files} />
              </div>
            )}

            {/* Risk areas */}
            {analysis.risk_areas?.length > 0 && (
              <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 11, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                  Risk Areas <span style={{ color: "#ef4444" }}>({analysis.risk_areas.length})</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {analysis.risk_areas.map((r, i) => (
                    <div key={i} style={{ background: "#020617", border: `1px solid ${SEV[r.severity]}22`,
                      borderLeft: `3px solid ${SEV[r.severity]}`, borderRadius: 6, padding: "10px 14px",
                      display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <span style={{ color: SEV[r.severity], fontSize: 10, fontWeight: 700,
                        textTransform: "uppercase", minWidth: 48, paddingTop: 1 }}>{r.severity}</span>
                      <div>
                        <div style={{ color: "#64748b", fontSize: 11, marginBottom: 3 }}>{r.file}</div>
                        <div style={{ color: "#94a3b8", fontSize: 12 }}>{r.issue}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Compare tab */}
        {tab === "compare" && (
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
              Comparison {compareRepos.length > 0 && `(${compareRepos.length} repos)`}
            </div>
            {compareRepos.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                {compareRepos.map(r => (
                  <div key={r.job_id} style={{ background: "#1e293b", borderRadius: 6, padding: "4px 10px",
                    fontSize: 11, color: "#38bdf8", display: "flex", gap: 8, alignItems: "center" }}>
                    {r.result?.repo || r.repo_url?.split("/").pop()}
                    <span onClick={() => setCompareRepos(p => p.filter(x => x.job_id !== r.job_id))}
                      style={{ cursor: "pointer", color: "#475569" }}>✕</span>
                  </div>
                ))}
              </div>
            )}
            <CompareView repos={compareRepos} />
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div style={{ marginTop: 32, background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>History</div>
            <div style={{ display: "grid", gap: 6 }}>
              {history.filter(j => j.status === "completed").map(j => (
                <div key={j.job_id} onClick={async () => {
                    const r = await fetch(`${API}/analysis/${j.job_id}`).then(r => r.json());
                    setResult(r); setTab("analysis"); setUrl(j.repo_url);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px",
                    borderRadius: 6, cursor: "pointer", background: "#020617",
                    border: "1px solid #1e293b" }}>
                  <span style={{ color: "#22c55e", fontSize: 10 }}>●</span>
                  <span style={{ color: "#64748b", fontSize: 12, flex: 1, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.repo_url}</span>
                  <span style={{ color: "#334155", fontSize: 11 }}>{j.file_count} files</span>
                  <span style={{ color: "#334155", fontSize: 11 }}>{j.total_lines} lines</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}