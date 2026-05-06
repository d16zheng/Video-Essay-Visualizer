const appStyles = String.raw`
:root {
  color-scheme: light;
  --bg: #f6efe4;
  --bg-accent: #fdf9f3;
  --panel: rgba(255, 252, 247, 0.88);
  --panel-strong: #fffdf8;
  --ink: #1f1b16;
  --muted: #5f564b;
  --line: rgba(64, 49, 31, 0.12);
  --highlight: #d96a38;
  --highlight-strong: #b84c1c;
  --success: #2f7d57;
  --danger: #9d2d32;
  --shadow: 0 18px 50px rgba(78, 57, 35, 0.12);
  font-family: "Avenir Next", "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  color: var(--ink);
  background:
    radial-gradient(circle at top, rgba(217, 106, 56, 0.18), transparent 32%),
    linear-gradient(180deg, #f4ebde 0%, #f8f3ea 52%, #fffdf8 100%);
}

main {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 56px 0 80px;
}

#app-root {
  min-height: calc(100vh - 136px);
}

.hero {
  margin-bottom: 28px;
}

.eyebrow {
  margin: 0 0 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--highlight-strong);
  font-size: 0.76rem;
  font-weight: 700;
}

h1 {
  margin: 0;
  max-width: 12ch;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(2.8rem, 5vw, 5rem);
  line-height: 0.96;
}

.hero-copy {
  max-width: 44rem;
  margin: 16px 0 0;
  color: var(--muted);
  font-size: 1.05rem;
  line-height: 1.6;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 28px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(14px);
}

.composer {
  padding: 24px;
}

form {
  display: grid;
  gap: 16px;
}

label {
  display: grid;
  gap: 10px;
  font-weight: 700;
}

.label-note {
  font-weight: 500;
  color: var(--muted);
  font-size: 0.95rem;
}

textarea {
  width: 100%;
  min-height: 280px;
  resize: vertical;
  padding: 18px 20px;
  border-radius: 22px;
  border: 1px solid rgba(81, 61, 39, 0.16);
  background: rgba(255, 255, 255, 0.82);
  color: var(--ink);
  font: inherit;
  font-size: 1rem;
  line-height: 1.55;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

textarea:focus {
  border-color: rgba(217, 106, 56, 0.65);
  box-shadow: 0 0 0 4px rgba(217, 106, 56, 0.12);
  transform: translateY(-1px);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

button {
  appearance: none;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--highlight) 0%, #ec8f4d 100%);
  color: white;
  padding: 14px 20px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
  box-shadow: 0 14px 28px rgba(217, 106, 56, 0.28);
}

button:hover:not(:disabled) {
  transform: translateY(-1px);
}

button:disabled {
  cursor: wait;
  opacity: 0.72;
}

.status,
.error {
  margin: 0;
  font-size: 0.95rem;
}

.status {
  color: var(--success);
}

.error {
  color: var(--danger);
}

.result {
  padding: 24px;
}

.result-head {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.result-head h2,
.thesis-card h3,
.graph-head h3,
.json-card summary {
  margin: 0;
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--muted);
  font-size: 0.95rem;
}

.pill {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(217, 106, 56, 0.1);
  color: var(--highlight-strong);
  font-weight: 700;
}

.thesis-card {
  margin: 18px 0 22px;
  padding: 18px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 236, 226, 0.95));
  border: 1px solid rgba(217, 106, 56, 0.18);
}

.thesis-card p {
  margin: 10px 0 0;
  color: var(--muted);
  line-height: 1.55;
}

.graph-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.graph-head p {
  margin: 0;
  color: var(--muted);
}

.graph-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 360px);
  gap: 18px;
  align-items: start;
}

.graph-stage {
  border-radius: 26px;
  border: 1px solid var(--line);
  background:
    linear-gradient(180deg, rgba(255, 253, 248, 0.98), rgba(248, 241, 233, 0.98));
  min-height: 720px;
  overflow: hidden;
}

.evidence-panel {
  position: sticky;
  top: 20px;
  display: grid;
  gap: 16px;
  padding: 18px;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.76);
}

.evidence-panel h3,
.evidence-field p,
.evidence-field blockquote {
  margin: 0;
}

.evidence-panel--empty {
  color: var(--muted);
}

.panel-kicker {
  margin: 0;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--highlight-strong);
  font-size: 0.76rem;
  font-weight: 700;
}

.evidence-fields {
  display: grid;
  gap: 14px;
}

.evidence-field {
  display: grid;
  gap: 6px;
}

.evidence-field span {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.evidence-field p {
  color: var(--ink);
  line-height: 1.55;
}

.evidence-quote {
  padding: 14px 16px;
  border-left: 3px solid rgba(217, 106, 56, 0.45);
  border-radius: 14px;
  background: rgba(217, 106, 56, 0.06);
  color: var(--ink);
  line-height: 1.6;
}

.edge-summary {
  margin-top: 18px;
  padding: 18px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid var(--line);
}

.edge-summary h3 {
  margin: 0 0 12px;
}

.edge-list {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.edge-list strong {
  color: var(--ink);
}

.edge-list span {
  color: var(--muted);
}

.json-card {
  margin-top: 18px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.68);
  overflow: hidden;
}

.json-card summary {
  padding: 16px 18px;
  cursor: pointer;
  font-weight: 700;
}

.json-card pre {
  margin: 0;
  padding: 0 18px 18px;
  overflow: auto;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.45;
}

.hint {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.react-flow__renderer,
.react-flow__pane {
  cursor: grab;
}

.react-flow__node {
  background: transparent;
  border: 0;
  box-shadow: none;
}

.react-flow__attribution {
  display: none;
}

.react-flow__controls {
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 14px 28px rgba(79, 58, 37, 0.16);
}

.react-flow__controls-button {
  width: 34px;
  height: 34px;
  border-color: rgba(64, 49, 31, 0.1);
  background: rgba(255, 252, 247, 0.96);
  color: var(--ink);
}

.react-flow__background pattern {
  color: rgba(184, 76, 28, 0.16);
}

.mind-node-shell {
  width: 100%;
}

.mind-node {
  display: grid;
  gap: 10px;
  padding: 16px;
  border-radius: 22px;
  border: 1px solid rgba(64, 49, 31, 0.12);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 14px 28px rgba(56, 42, 28, 0.1);
}

.mind-node h4,
.mind-node p,
.edge-list li,
.section-stats li {
  margin: 0;
}

.mind-node-shell--selected .mind-node {
  border-color: rgba(217, 106, 56, 0.42);
  box-shadow:
    0 14px 28px rgba(56, 42, 28, 0.12),
    0 0 0 3px rgba(217, 106, 56, 0.14);
}

.mind-node--section {
  gap: 12px;
  min-height: 172px;
  background: linear-gradient(180deg, rgba(255, 251, 246, 0.96), rgba(248, 239, 228, 0.92));
  border-color: rgba(184, 76, 28, 0.15);
}

.mind-node--thesis {
  background: linear-gradient(180deg, rgba(255, 247, 241, 1), rgba(255, 239, 230, 1));
}

.mind-node--evidence,
.mind-node--example {
  background: linear-gradient(180deg, rgba(241, 250, 244, 1), rgba(231, 245, 236, 1));
}

.mind-node--counterpoint {
  background: linear-gradient(180deg, rgba(252, 244, 241, 1), rgba(247, 235, 230, 1));
}

.mind-node--conclusion {
  background: linear-gradient(180deg, rgba(247, 248, 255, 1), rgba(236, 240, 252, 1));
}

.node-type,
.section-kicker {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(64, 49, 31, 0.08);
  color: var(--muted);
  font-size: 0.77rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.section-kicker {
  background: rgba(217, 106, 56, 0.1);
  color: var(--highlight-strong);
}

.mind-node h4 {
  font-size: 1rem;
}

.mind-node p {
  color: var(--muted);
  line-height: 1.5;
}

.node-evidence {
  border-radius: 16px;
  border: 1px solid rgba(64, 49, 31, 0.1);
  background: rgba(255, 252, 247, 0.72);
  overflow: hidden;
}

.node-evidence summary {
  padding: 10px 12px;
  cursor: pointer;
  color: var(--highlight-strong);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.node-evidence blockquote {
  margin: 0;
  padding: 0 12px 12px 16px;
  border-left: 3px solid rgba(217, 106, 56, 0.35);
  color: var(--ink);
  font-size: 0.94rem;
  line-height: 1.48;
}

.node-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.node-meta span {
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(64, 49, 31, 0.08);
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.section-stats {
  display: grid;
  gap: 8px;
  padding: 0;
  list-style: none;
}

.section-stats li {
  color: var(--muted);
  font-size: 0.92rem;
}

@media (max-width: 720px) {
  main {
    width: min(100vw - 20px, 1180px);
    padding-top: 32px;
  }

  .composer,
  .result {
    padding: 18px;
  }

  textarea {
    min-height: 240px;
  }

  .graph-head {
    display: grid;
  }

  .graph-workspace {
    grid-template-columns: 1fr;
  }

  .graph-stage {
    min-height: 620px;
  }

  .evidence-panel {
    position: static;
  }
}
`;

export function renderAppPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Visualize Transcript</title>
    <link rel="stylesheet" href="/assets/app.css" />
    <style>${appStyles}</style>
  </head>
  <body>
    <main>
      <div id="app-root"></div>
    </main>

    <script type="module" src="/assets/app.js"></script>
  </body>
</html>`;
}
