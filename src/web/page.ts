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

.result[hidden] {
  display: none;
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

.graph-stage {
  position: relative;
  overflow: auto;
  border-radius: 26px;
  border: 1px solid var(--line);
  background:
    linear-gradient(180deg, rgba(255, 253, 248, 0.98), rgba(248, 241, 233, 0.98));
  min-height: 320px;
}

.graph-stage::before {
  content: "";
  position: sticky;
  inset: 0;
  display: block;
  width: 100%;
  height: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.edge-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

.section-grid {
  position: relative;
  z-index: 2;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(260px, 300px);
  gap: 18px;
  padding: 20px;
  align-items: start;
}

.section-card {
  display: grid;
  gap: 14px;
  align-content: start;
  padding: 16px;
  min-height: 240px;
  border-radius: 24px;
  border: 1px solid rgba(64, 49, 31, 0.1);
  background: rgba(255, 255, 255, 0.78);
}

.section-kicker {
  margin: 0;
  color: var(--highlight-strong);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.section-card h4 {
  margin: 0;
  font-size: 1.1rem;
}

.section-card > p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
}

.node-stack {
  display: grid;
  gap: 12px;
}

.node-card {
  position: relative;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(64, 49, 31, 0.12);
  background: var(--panel-strong);
  box-shadow: 0 10px 18px rgba(56, 42, 28, 0.08);
}

.node-card[data-node-type="thesis"] {
  background: linear-gradient(180deg, rgba(255, 247, 241, 1), rgba(255, 239, 230, 1));
}

.node-card[data-node-type="evidence"] {
  background: linear-gradient(180deg, rgba(241, 250, 244, 1), rgba(231, 245, 236, 1));
}

.node-card[data-node-type="counterpoint"] {
  background: linear-gradient(180deg, rgba(252, 244, 241, 1), rgba(247, 235, 230, 1));
}

.node-type {
  display: inline-flex;
  align-items: center;
  margin-bottom: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(64, 49, 31, 0.08);
  color: var(--muted);
  font-size: 0.77rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.node-card h5,
.node-card p,
.node-card blockquote,
.edge-list li {
  margin: 0;
}

.node-card h5 {
  font-size: 1rem;
}

.node-card p {
  margin-top: 8px;
  color: var(--muted);
  line-height: 1.5;
}

.node-card blockquote {
  margin-top: 10px;
  padding-left: 12px;
  border-left: 3px solid rgba(217, 106, 56, 0.35);
  color: var(--ink);
  font-size: 0.94rem;
  line-height: 1.48;
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
}
`;

const appScript = String.raw`
const form = document.getElementById("transcript-form");
const transcriptInput = document.getElementById("transcript-input");
const submitButton = document.getElementById("submit-button");
const statusMessage = document.getElementById("status-message");
const errorMessage = document.getElementById("error-message");
const resultPanel = document.getElementById("result-panel");
const resultTitle = document.getElementById("result-title");
const resultSummary = document.getElementById("result-summary");
const resultMeta = document.getElementById("result-meta");
const thesisCard = document.getElementById("thesis-card");
const thesisLabel = document.getElementById("thesis-label");
const thesisSummary = document.getElementById("thesis-summary");
const thesisExcerpt = document.getElementById("thesis-excerpt");
const sectionGrid = document.getElementById("section-grid");
const edgeLayer = document.getElementById("edge-layer");
const graphStage = document.getElementById("graph-stage");
const edgeList = document.getElementById("edge-list");
const rawJson = document.getElementById("raw-json");

let currentMap = null;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function edgeColor(relationship) {
  switch (relationship) {
    case "supports":
      return "#2f7d57";
    case "contrasts":
      return "#9d2d32";
    case "concludes":
      return "#5f6b2d";
    case "explains":
      return "#2563eb";
    case "contains":
      return "#b84c1c";
    case "leads_to":
      return "#7a5c2b";
    default:
      return "#8a7760";
  }
}

function formatCount(label, value) {
  return value + " " + label + (value === 1 ? "" : "s");
}

function setLoading(isLoading) {
  transcriptInput.disabled = isLoading;
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Building graph..." : "Build graph";
  statusMessage.hidden = !isLoading;
  statusMessage.textContent = isLoading ? "Extracting structure from the transcript..." : "";
}

function showError(message) {
  errorMessage.hidden = false;
  errorMessage.textContent = message;
}

function clearError() {
  errorMessage.hidden = true;
  errorMessage.textContent = "";
}

function renderMeta(map) {
  const counts = [
    formatCount("section", map.sections.length),
    formatCount("node", map.nodes.length),
    formatCount("edge", map.edges.length),
    map.source.transcriptLengthChars + " chars"
  ];

  resultMeta.innerHTML = counts
    .map(function (item) {
      return '<span class="pill">' + escapeHtml(item) + "</span>";
    })
    .join("");
}

function renderThesis(map) {
  const thesisNode = map.nodes.find(function (node) {
    return node.id === map.thesisNodeId;
  });

  if (!thesisNode) {
    thesisCard.hidden = true;
    return;
  }

  thesisCard.hidden = false;
  thesisLabel.textContent = thesisNode.label;
  thesisSummary.textContent = thesisNode.summary;
  thesisExcerpt.textContent = '"' + thesisNode.transcriptSpan.excerpt + '"';
}

function renderSections(map) {
  const nodesById = new Map(
    map.nodes.map(function (node) {
      return [node.id, node];
    })
  );

  sectionGrid.innerHTML = "";

  map.sections
    .slice()
    .sort(function (left, right) {
      return left.order - right.order;
    })
    .forEach(function (section, index) {
      const sectionCard = document.createElement("section");
      sectionCard.className = "section-card";

      const nodeMarkup = section.nodeIds
        .map(function (nodeId) {
          const node = nodesById.get(nodeId);

          if (!node) {
            return "";
          }

          const confidence = typeof node.confidence === "number"
            ? '<p>Confidence: ' + Math.round(node.confidence * 100) + '%</p>'
            : "";

          return [
            '<article class="node-card" data-node-id="' + escapeHtml(node.id) + '" data-node-type="' + escapeHtml(node.type) + '">',
            '<div class="node-type">' + escapeHtml(node.type) + "</div>",
            "<h5>" + escapeHtml(node.label) + "</h5>",
            "<p>" + escapeHtml(node.summary) + "</p>",
            confidence,
            "<blockquote>" + escapeHtml(node.transcriptSpan.excerpt) + "</blockquote>",
            "</article>"
          ].join("");
        })
        .join("");

      sectionCard.innerHTML = [
        '<p class="section-kicker">Section ' + String(index + 1) + "</p>",
        "<h4>" + escapeHtml(section.title) + "</h4>",
        "<p>" + escapeHtml(section.summary) + "</p>",
        '<div class="node-stack">' + nodeMarkup + "</div>"
      ].join("");

      sectionGrid.append(sectionCard);
    });
}

function renderEdges(map) {
  const stageRect = graphStage.getBoundingClientRect();
  const stageWidth = Math.max(graphStage.scrollWidth, stageRect.width);
  const stageHeight = Math.max(graphStage.scrollHeight, stageRect.height);

  edgeLayer.setAttribute("width", String(stageWidth));
  edgeLayer.setAttribute("height", String(stageHeight));
  edgeLayer.setAttribute("viewBox", "0 0 " + String(stageWidth) + " " + String(stageHeight));
  edgeLayer.innerHTML = "";

  const nodePositions = new Map();

  graphStage.querySelectorAll(".node-card").forEach(function (nodeElement) {
    const rect = nodeElement.getBoundingClientRect();
    const nodeId = nodeElement.getAttribute("data-node-id");

    if (!nodeId) {
      return;
    }

    nodePositions.set(nodeId, {
      x: rect.left - stageRect.left + graphStage.scrollLeft + rect.width / 2,
      y: rect.top - stageRect.top + graphStage.scrollTop + rect.height / 2
    });
  });

  map.edges.forEach(function (edge) {
    const source = nodePositions.get(edge.source);
    const target = nodePositions.get(edge.target);

    if (!source || !target) {
      return;
    }

    const curveStrength = Math.max(48, Math.abs(target.x - source.x) / 2);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");

    path.setAttribute(
      "d",
      "M " + String(source.x) + " " + String(source.y) +
        " C " + String(source.x + curveStrength) + " " + String(source.y) +
        ", " + String(target.x - curveStrength) + " " + String(target.y) +
        ", " + String(target.x) + " " + String(target.y)
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", edgeColor(edge.relationship));
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("opacity", "0.72");

    marker.setAttribute("cx", String(target.x));
    marker.setAttribute("cy", String(target.y));
    marker.setAttribute("r", "4");
    marker.setAttribute("fill", edgeColor(edge.relationship));

    edgeLayer.append(path, marker);
  });
}

function renderEdgeSummary(map) {
  const nodesById = new Map(
    map.nodes.map(function (node) {
      return [node.id, node];
    })
  );

  edgeList.innerHTML = map.edges.length
    ? map.edges
        .map(function (edge) {
          const sourceLabel = nodesById.get(edge.source)?.label ?? edge.source;
          const targetLabel = nodesById.get(edge.target)?.label ?? edge.target;
          const explanation = edge.explanation ? ' <span>' + escapeHtml(edge.explanation) + "</span>" : "";

          return [
            "<li>",
            "<strong>" + escapeHtml(sourceLabel) + "</strong>",
            " ",
            '<span>' + escapeHtml(edge.relationship) + " -> " + escapeHtml(targetLabel) + "</span>",
            explanation,
            "</li>"
          ].join("");
        })
        .join("")
    : "<li><span>No explicit edges were returned for this transcript.</span></li>";
}

function renderMap(map) {
  currentMap = map;
  resultPanel.hidden = false;
  resultTitle.textContent = map.title;
  resultSummary.textContent = map.summary;
  renderMeta(map);
  renderThesis(map);
  renderSections(map);
  renderEdgeSummary(map);
  rawJson.textContent = JSON.stringify(map, null, 2);

  window.requestAnimationFrame(function () {
    renderEdges(map);
  });
}

window.addEventListener("resize", function () {
  if (!currentMap) {
    return;
  }

  window.requestAnimationFrame(function () {
    renderEdges(currentMap);
  });
});

graphStage.addEventListener("scroll", function () {
  if (!currentMap) {
    return;
  }

  window.requestAnimationFrame(function () {
    renderEdges(currentMap);
  });
});

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearError();

  const transcript = transcriptInput.value.trim();

  if (!transcript) {
    showError("Paste a transcript before submitting.");
    return;
  }

  setLoading(true);

  try {
    const response = await fetch("/api/transcript-map", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        transcript: transcript
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        typeof payload.error === "string" ? payload.error : "Something went wrong while building the graph."
      );
    }

    renderMap(payload.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    showError(message);
  } finally {
    setLoading(false);
  }
});
`;

export function renderAppPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Visualize Transcript</title>
    <style>${appStyles}</style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">Transcript to graph</p>
        <h1>Paste text. Get structure.</h1>
        <p class="hero-copy">
          This first pass is intentionally tiny: paste a transcript, submit it, and inspect the graph that comes back.
          No links, uploads, accounts, payments, or saved projects yet.
        </p>
      </section>

      <section class="panel composer">
        <form id="transcript-form">
          <label for="transcript-input">
            Transcript
            <span class="label-note">Paste plain text. The backend will extract sections, nodes, and edges.</span>
          </label>
          <textarea
            id="transcript-input"
            name="transcript"
            placeholder="Paste a transcript here..."
            spellcheck="false"
          ></textarea>
          <div class="controls">
            <button id="submit-button" type="submit">Build graph</button>
            <p id="status-message" class="status" role="status" hidden></p>
            <p id="error-message" class="error" role="alert" hidden></p>
          </div>
        </form>
      </section>

      <section id="result-panel" class="panel result" hidden>
        <div class="result-head">
          <h2 id="result-title"></h2>
          <p id="result-summary" class="hero-copy"></p>
          <div id="result-meta" class="result-meta"></div>
        </div>

        <article id="thesis-card" class="thesis-card" hidden>
          <h3>Main thesis</h3>
          <p><strong id="thesis-label"></strong></p>
          <p id="thesis-summary"></p>
          <p id="thesis-excerpt"></p>
        </article>

        <div class="graph-head">
          <h3>Graph view</h3>
          <p>Sections are laid out left to right. Curved lines show extracted relationships between nodes.</p>
        </div>

        <div id="graph-stage" class="graph-stage">
          <svg id="edge-layer" class="edge-layer" aria-hidden="true"></svg>
          <div id="section-grid" class="section-grid"></div>
        </div>

        <section class="edge-summary">
          <h3>Relationships</h3>
          <ul id="edge-list" class="edge-list"></ul>
        </section>

        <details class="json-card">
          <summary>Raw JSON</summary>
          <pre id="raw-json"></pre>
        </details>
      </section>
    </main>

    <script type="module">${appScript}</script>
  </body>
</html>`;
}
