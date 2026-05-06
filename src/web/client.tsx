import React, { startTransition, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { hierarchy, tree } from "d3-hierarchy";

import type {
  TranscriptMap,
  TranscriptMapEdge,
  TranscriptMapEdgeRelationship,
  TranscriptMapNode,
  TranscriptMapNodeType,
  TranscriptMapSection
} from "../core/schema/transcript-map.js";
import type {
  NodePositionOverride,
  NodePositionOverrides,
  ProjectSummary,
  SavedProject
} from "../core/schema/project.js";

type SectionNodeData = {
  kind: "section";
  title: string;
  summary: string;
  order: number;
  claimCount: number;
  detailCount: number;
};

type ContentNodeData = {
  kind: "content";
  node: TranscriptMapNode;
};

type MindMapData = SectionNodeData | ContentNodeData;

type MindMapGraph = {
  nodes: Array<Node<MindMapData>>;
  edges: Array<Edge>;
};

type MapApiResponse =
  | {
      ok: true;
      data: TranscriptMap;
    }
  | {
      ok: false;
      error?: string;
    };

type ProjectsApiResponse =
  | {
      ok: true;
      data: ProjectSummary[];
    }
  | {
      ok: false;
      error?: string;
    };

type ProjectApiResponse =
  | {
      ok: true;
      data: SavedProject;
    }
  | {
      ok: false;
      error?: string;
    };

type TreeBranch = {
  id: string;
  children: TreeBranch[];
};

const starterTranscript = `Section 1: Why creativity often feels blocked.
Most people think they lack ideas, but the real problem is usually fear of producing bad work. The first claim is that perfectionism shuts down experimentation before it starts. One example is the student who waits for inspiration instead of drafting early. Evidence for this comes from repeated creative routines: people who make something daily generate more usable ideas over time.

Section 2: Structure creates freedom.
The next claim is that constraints help the mind focus. A short deadline, a fixed format, or a narrow theme can reduce decision fatigue. For example, a writer asked to produce one paragraph a day often finishes more than a writer chasing the perfect essay. This can seem counterintuitive, but the counterpoint is that rigid systems can become stale if they never change.

Section 3: Reflection turns output into growth.
The conclusion is that creative momentum comes from cycles of making, reviewing, and adjusting instead of waiting for confidence first.`;

const edgePalette: Record<TranscriptMapEdgeRelationship | "helper", string> = {
  contains: "#b84c1c",
  supports: "#2f7d57",
  explains: "#2563eb",
  contrasts: "#9d2d32",
  leads_to: "#7a5c2b",
  concludes: "#5f6b2d",
  helper: "#bda78f"
};

const nodeTypeLabels: Record<TranscriptMapNodeType, string> = {
  thesis: "Thesis",
  claim: "Claim",
  evidence: "Evidence",
  example: "Example",
  counterpoint: "Counterpoint",
  conclusion: "Conclusion"
};

const projectDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatCount(label: string, value: number): string {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
}

function edgeColor(relationship: TranscriptMapEdgeRelationship | "helper"): string {
  return edgePalette[relationship];
}

function formatProjectUpdatedAt(value: string): string {
  return projectDateFormatter.format(new Date(value));
}

function isPersistenceUnavailableError(message: string): boolean {
  return (
    message.includes("Persistence is unavailable") || message.includes("DATABASE_URL is not configured")
  );
}

function getEditableNodeTypes(node: TranscriptMapNode, thesisNodeId: string): TranscriptMapNodeType[] {
  if (node.id === thesisNodeId) {
    return ["thesis"];
  }

  return ["claim", "evidence", "example", "counterpoint", "conclusion"];
}

function isClaimLinked(edge: TranscriptMapEdge, claimId: string, nodeId: string): boolean {
  return (
    (edge.source === claimId && edge.target === nodeId) ||
    (edge.source === nodeId && edge.target === claimId)
  );
}

function resolveSelectedNode(map: TranscriptMap, selectedNodeId: string | null): TranscriptMapNode | null {
  return (
    map.nodes.find((node) => node.id === selectedNodeId) ??
    map.nodes.find((node) => node.id === map.thesisNodeId) ??
    map.nodes[0] ??
    null
  );
}

function updateNodeInMap(
  map: TranscriptMap,
  nodeId: string,
  updater: (node: TranscriptMapNode) => TranscriptMapNode
): TranscriptMap {
  return {
    ...map,
    nodes: map.nodes.map((node) => (node.id === nodeId ? updater(node) : node))
  };
}

function deleteNodeFromMap(map: TranscriptMap, nodeId: string): TranscriptMap {
  if (nodeId === map.thesisNodeId) {
    return map;
  }

  return {
    ...map,
    nodes: map.nodes.filter((node) => node.id !== nodeId),
    edges: map.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    sections: map.sections.map((section) => ({
      ...section,
      nodeIds: section.nodeIds.filter((sectionNodeId) => sectionNodeId !== nodeId)
    }))
  };
}

function applyNodePositionOverrides(
  graph: MindMapGraph,
  positionOverrides: NodePositionOverrides
): MindMapGraph {
  return {
    nodes: graph.nodes.map((node) => {
      if (node.data.kind !== "content") {
        return {
          ...node,
          draggable: false
        };
      }

      return {
        ...node,
        position: positionOverrides[node.id] ?? node.position,
        draggable: true
      };
    }),
    edges: graph.edges
  };
}

function buildSectionBranch(
  section: TranscriptMapSection,
  nodesById: Map<string, TranscriptMapNode>,
  edges: TranscriptMapEdge[]
): TreeBranch {
  const sectionNodes = section.nodeIds
    .map((nodeId) => nodesById.get(nodeId))
    .filter((node): node is TranscriptMapNode => Boolean(node))
    .filter((node) => node.type !== "thesis" && node.type !== "conclusion");

  const claimNodes = sectionNodes.filter((node) => node.type === "claim");
  const claimChildren = new Map<string, TranscriptMapNode[]>();
  const assignedChildIds = new Set<string>();

  for (const claimNode of claimNodes) {
    const matchingChildren = sectionNodes.filter((node) => {
      if (node.id === claimNode.id || node.type === "claim") {
        return false;
      }

      return edges.some((edge) => isClaimLinked(edge, claimNode.id, node.id));
    });

    if (matchingChildren.length > 0) {
      claimChildren.set(claimNode.id, matchingChildren);
    }

    for (const childNode of matchingChildren) {
      assignedChildIds.add(childNode.id);
    }
  }

  const unattachedNodes = sectionNodes.filter(
    (node) => node.type !== "claim" && !assignedChildIds.has(node.id)
  );

  return {
    id: `section:${section.id}`,
    children: [
      ...claimNodes.map((claimNode) => ({
        id: claimNode.id,
        children:
          claimChildren.get(claimNode.id)?.map((childNode) => ({
            id: childNode.id,
            children: []
          })) ?? []
      })),
      ...unattachedNodes.map((node) => ({
        id: node.id,
        children: []
      }))
    ]
  };
}

function buildMindMap(map: TranscriptMap): MindMapGraph {
  const nodesById = new Map(map.nodes.map((node) => [node.id, node]));
  const sortedSections = map.sections.slice().sort((left, right) => left.order - right.order);
  const thesisNode = nodesById.get(map.thesisNodeId);
  const conclusionNodes = map.nodes.filter((node) => node.type === "conclusion");

  const graphNodes: Array<Node<MindMapData>> = [];
  const graphEdges: Array<Edge> = [];

  const sectionGap = 360;
  const sectionWidth = 300;
  const contentWidth = 240;
  const graphPadding = 180;
  const topY = 40;
  const sectionY = 250;
  const rowGap = 190;
  const totalWidth =
    graphPadding * 2 + sectionWidth + Math.max(sortedSections.length - 1, 0) * sectionGap;
  const centerX = totalWidth / 2;

  if (thesisNode) {
    graphNodes.push({
      id: thesisNode.id,
      position: {
        x: centerX - contentWidth / 2,
        y: topY
      },
      data: {
        kind: "content",
        node: thesisNode
      },
      className: "mind-node-shell",
      style: { width: contentWidth },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: false
    });
  }

  let deepestY = sectionY;

  for (const [index, section] of sortedSections.entries()) {
    const branch = buildSectionBranch(section, nodesById, map.edges);
    const sectionTree = tree<TreeBranch>().nodeSize([210, rowGap]);
    const sectionHierarchy = hierarchy(branch);

    sectionTree(sectionHierarchy);

    const sectionCenterX = graphPadding + sectionWidth / 2 + index * sectionGap;
    const sectionNodeId = `section:${section.id}`;
    const sectionNodes = section.nodeIds
      .map((nodeId) => nodesById.get(nodeId))
      .filter((node): node is TranscriptMapNode => Boolean(node))
      .filter((node) => node.type !== "thesis" && node.type !== "conclusion");

    graphNodes.push({
      id: sectionNodeId,
      position: {
        x: sectionCenterX - sectionWidth / 2,
        y: sectionY
      },
      data: {
        kind: "section",
        title: section.title,
        summary: section.summary,
        order: section.order,
        claimCount: sectionNodes.filter((node) => node.type === "claim").length,
        detailCount: sectionNodes.filter((node) => node.type !== "claim").length
      },
      className: "mind-node-shell",
      style: { width: sectionWidth },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: false
    });

    if (thesisNode) {
      graphEdges.push({
        id: `helper:${map.thesisNodeId}:${sectionNodeId}`,
        source: map.thesisNodeId,
        target: sectionNodeId,
        type: "smoothstep",
        animated: false,
        style: {
          stroke: edgeColor("helper"),
          strokeDasharray: "7 7",
          strokeWidth: 1.5,
          opacity: 0.5
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor("helper")
        }
      });
    }

    for (const descendant of sectionHierarchy.descendants().slice(1)) {
      const sourceNode = nodesById.get(descendant.data.id);

      if (!sourceNode) {
        continue;
      }

      const parentBranch = descendant.parent?.data.id;
      const globalCenterX =
        sectionCenterX + (descendant.x ?? 0) - (sectionHierarchy.x ?? 0);
      const globalY = sectionY + 150 + (descendant.y ?? 0);

      deepestY = Math.max(deepestY, globalY);

      graphNodes.push({
        id: sourceNode.id,
        position: {
          x: globalCenterX - contentWidth / 2,
          y: globalY
        },
        data: {
          kind: "content",
          node: sourceNode
        },
        className: "mind-node-shell",
        style: { width: contentWidth },
        sourcePosition: sourceNode.type === "conclusion" ? Position.Top : Position.Bottom,
        targetPosition: sourceNode.type === "thesis" ? Position.Bottom : Position.Top,
        draggable: false
      });

      if (parentBranch) {
        const hasExplicitEdge = map.edges.some(
          (edge) =>
            (edge.source === parentBranch && edge.target === sourceNode.id) ||
            (edge.source === sourceNode.id && edge.target === parentBranch)
        );

        if (!hasExplicitEdge) {
          graphEdges.push({
            id: `helper:${parentBranch}:${sourceNode.id}`,
            source: parentBranch,
            target: sourceNode.id,
            type: "smoothstep",
            style: {
              stroke: edgeColor("helper"),
              strokeDasharray: "6 6",
              strokeWidth: 1.5,
              opacity: 0.55
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: edgeColor("helper")
            }
          });
        }
      }
    }
  }

  const renderedBeforeConclusions = new Set(graphNodes.map((node) => node.id));
  const conclusionY = deepestY + 240;

  for (const [index, conclusionNode] of conclusionNodes.entries()) {
    if (renderedBeforeConclusions.has(conclusionNode.id)) {
      continue;
    }

    const totalSpan = Math.max((conclusionNodes.length - 1) * 280, 0);
    const centerOffset = index * 280 - totalSpan / 2;

    graphNodes.push({
      id: conclusionNode.id,
      position: {
        x: centerX + centerOffset - contentWidth / 2,
        y: conclusionY
      },
      data: {
        kind: "content",
        node: conclusionNode
      },
      className: "mind-node-shell",
      style: { width: contentWidth },
      sourcePosition: Position.Top,
      targetPosition: Position.Top,
      draggable: false
    });
  }

  const renderedNodeIds = new Set(graphNodes.map((node) => node.id));

  for (const edge of map.edges) {
    if (!renderedNodeIds.has(edge.source) || !renderedNodeIds.has(edge.target)) {
      continue;
    }

    graphEdges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "bezier",
      label: edge.relationship.replaceAll("_", " "),
      labelStyle: {
        fill: "#5f564b",
        fontWeight: 700,
        fontSize: 11,
        textTransform: "uppercase"
      },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 999,
      labelBgStyle: {
        fill: "rgba(255, 252, 247, 0.96)",
        stroke: "rgba(64, 49, 31, 0.08)"
      },
      style: {
        stroke: edgeColor(edge.relationship),
        strokeWidth: 2.5
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edgeColor(edge.relationship)
      },
      data: {
        explanation: edge.explanation
      }
    });
  }

  return {
    nodes: graphNodes,
    edges: graphEdges
  };
}

function buildNodeLabel(data: MindMapData): React.JSX.Element {
  if (data.kind === "section") {
    return (
      <article className="mind-node mind-node--section">
        <span className="section-kicker">Section {data.order + 1}</span>
        <h4>{data.title}</h4>
        <p>{data.summary}</p>
        <ul className="section-stats">
          <li>{formatCount("claim", data.claimCount)}</li>
          <li>{formatCount("detail node", data.detailCount)}</li>
        </ul>
      </article>
    );
  }

  return (
    <article className={`mind-node mind-node--${data.node.type}`}>
      <span className="node-type">{nodeTypeLabels[data.node.type]}</span>
      <h4>{data.node.label}</h4>
      <p>{data.node.summary}</p>
      <details className="node-evidence">
        <summary>Transcript evidence</summary>
        <blockquote>{data.node.transcriptSpan.excerpt}</blockquote>
      </details>
      <div className="node-meta">
        {typeof data.node.confidence === "number" ? (
          <span>{Math.round(data.node.confidence * 100)}% confidence</span>
        ) : null}
        {data.node.isInferred ? <span>Inferred</span> : null}
      </div>
    </article>
  );
}

function TranscriptEvidencePanel({
  node,
  thesisNodeId,
  onRenameNode,
  onUpdateSummary,
  onUpdateType,
  onDeleteNode
}: {
  node: TranscriptMapNode | null;
  thesisNodeId: string;
  onRenameNode: (value: string) => void;
  onUpdateSummary: (value: string) => void;
  onUpdateType: (value: TranscriptMapNodeType) => void;
  onDeleteNode: () => void;
}): React.JSX.Element {
  if (!node) {
    return (
      <aside className="evidence-panel evidence-panel--empty">
        <p className="panel-kicker">Node editor</p>
        <h3>Select a node</h3>
        <p>
          Click any thesis, claim, evidence, example, counterpoint, or conclusion node to inspect
          its evidence and make local corrections.
        </p>
      </aside>
    );
  }

  const hasCharRange =
    typeof node.transcriptSpan.startChar === "number" &&
    typeof node.transcriptSpan.endChar === "number";
  const editableTypes = getEditableNodeTypes(node, thesisNodeId);
  const canDelete = node.id !== thesisNodeId;

  return (
    <aside className="evidence-panel">
      <div className="panel-head">
        <p className="panel-kicker">Node editor</p>
        <h3>{node.label}</h3>
        <p className="editor-note">
          Rename, rewrite, retype, delete, or drag this node. Save the project when you want to
          keep these edits beyond the current session.
        </p>
      </div>

      <label className="editor-field">
        <span>Node label</span>
        <input
          className="field-input"
          type="text"
          value={node.label}
          onChange={(event) => {
            onRenameNode(event.target.value);
          }}
        />
      </label>

      <label className="editor-field">
        <span>Node summary</span>
        <textarea
          className="field-input editor-textarea"
          value={node.summary}
          onChange={(event) => {
            onUpdateSummary(event.target.value);
          }}
        />
      </label>

      <label className="editor-field">
        <span>Type</span>
        <select
          className="field-input field-select"
          value={node.type}
          onChange={(event) => {
            onUpdateType(event.target.value as TranscriptMapNodeType);
          }}
          disabled={editableTypes.length === 1}
        >
          {editableTypes.map((type) => (
            <option key={type} value={type}>
              {nodeTypeLabels[type]}
            </option>
          ))}
        </select>
      </label>

      <div className="editor-actions">
        {canDelete ? (
          <button className="button-danger" type="button" onClick={onDeleteNode}>
            Delete node
          </button>
        ) : (
          <p className="editor-note">The thesis node stays locked in this first editing pass.</p>
        )}
      </div>

      <div className="evidence-fields">
        <div className="evidence-field">
          <span>Type</span>
          <p>{nodeTypeLabels[node.type]}</p>
        </div>
        <div className="evidence-field">
          <span>Related transcript excerpt</span>
          <blockquote className="evidence-quote">{node.transcriptSpan.excerpt}</blockquote>
        </div>
        {hasCharRange ? (
          <div className="evidence-field">
            <span>Character span</span>
            <p>
              {node.transcriptSpan.startChar}-{node.transcriptSpan.endChar}
            </p>
          </div>
        ) : null}
      </div>
      <div className="node-meta">
        {typeof node.confidence === "number" ? (
          <span>{Math.round(node.confidence * 100)}% confidence</span>
        ) : null}
        {node.isInferred ? <span>Inferred node</span> : null}
      </div>
    </aside>
  );
}

function GraphView({
  map,
  selectedNodeId,
  positionOverrides,
  onSelectNode,
  onMoveNode,
  onRenameNode,
  onUpdateSummary,
  onUpdateType,
  onDeleteNode
}: {
  map: TranscriptMap;
  selectedNodeId: string | null;
  positionOverrides: NodePositionOverrides;
  onSelectNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, position: NodePositionOverride) => void;
  onRenameNode: (value: string) => void;
  onUpdateSummary: (value: string) => void;
  onUpdateType: (value: TranscriptMapNodeType) => void;
  onDeleteNode: () => void;
}): React.JSX.Element {
  const graph = applyNodePositionOverrides(buildMindMap(map), positionOverrides);
  const viewportHeight = Math.max(720, Math.min(920, 460 + map.nodes.length * 24));
  const selectedNode = resolveSelectedNode(map, selectedNodeId);

  return (
    <>
      <div className="graph-head">
        <h3>Mind map view</h3>
        <p>
          Click a node to inspect its evidence panel. Thesis anchors the top, sections form the
          main lane, claims sit underneath, and supporting detail hangs below them.
        </p>
      </div>

      <div className="graph-workspace">
        <div className="graph-stage" style={{ height: `${viewportHeight}px` }}>
          <ReactFlow
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodes={graph.nodes.map((node) => {
              const isSelected =
                node.data.kind === "content" && node.data.node.id === selectedNode?.id;

              return {
                ...node,
                className: `${node.className ?? ""}${isSelected ? " mind-node-shell--selected" : ""}`,
                data: {
                  ...node.data,
                  label: buildNodeLabel(node.data)
                }
              };
            })}
            edges={graph.edges}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => {
              const data = node.data as MindMapData;

              if (data.kind === "content") {
                onSelectNode(data.node.id);
              }
            }}
            onNodeDragStop={(_, node) => {
              const data = node.data as MindMapData;

              if (data.kind === "content") {
                onMoveNode(data.node.id, node.position);
              }
            }}
            proOptions={{ hideAttribution: true }}
          >
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => {
                const data = node.data as MindMapData;
                if (data.kind === "section") {
                  return "#f2dfca";
                }

                return edgeColor(
                  data.node.type === "thesis"
                    ? "contains"
                    : data.node.type === "conclusion"
                      ? "explains"
                      : data.node.type === "counterpoint"
                        ? "contrasts"
                        : data.node.type === "evidence" || data.node.type === "example"
                          ? "supports"
                          : "leads_to"
                );
              }}
            />
            <Controls showInteractive={false} />
            <Background gap={24} size={1.2} />
          </ReactFlow>
        </div>

        <TranscriptEvidencePanel
          node={selectedNode}
          thesisNodeId={map.thesisNodeId}
          onRenameNode={onRenameNode}
          onUpdateSummary={onUpdateSummary}
          onUpdateType={onUpdateType}
          onDeleteNode={onDeleteNode}
        />
      </div>
    </>
  );
}

function ProjectLibrary({
  projects,
  activeProjectId,
  isLoadingProjects,
  openingProjectId,
  persistenceUnavailableReason,
  projectsError,
  onOpenProject
}: {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  isLoadingProjects: boolean;
  openingProjectId: string | null;
  persistenceUnavailableReason: string;
  projectsError: string;
  onOpenProject: (projectId: string) => void;
}): React.JSX.Element {
  return (
    <aside className="panel project-library">
      <div className="library-head">
        <p className="panel-kicker">Projects</p>
        <h2>Saved maps</h2>
        <p className="hero-copy">
          Persist the transcript, graph JSON, and layout so a useful map is easy to reopen later.
        </p>
      </div>

      {persistenceUnavailableReason ? (
        <p className="hint">{persistenceUnavailableReason}</p>
      ) : projectsError ? (
        <p className="error" role="alert">
          {projectsError}
        </p>
      ) : projects.length === 0 ? (
        <p className="hint">
          {isLoadingProjects
            ? "Loading saved projects..."
            : "No saved projects yet. Save the first map that feels worth keeping."}
        </p>
      ) : (
        <ul className="project-list">
          {projects.map((project) => {
            const isActive = project.id === activeProjectId;
            const isOpening = project.id === openingProjectId;

            return (
              <li key={project.id}>
                <button
                  className={`project-card${isActive ? " project-card--active" : ""}`}
                  type="button"
                  onClick={() => {
                    onOpenProject(project.id);
                  }}
                  disabled={isOpening}
                >
                  <div className="project-card-head">
                    <strong>{project.title}</strong>
                    <span>{isOpening ? "Opening..." : formatProjectUpdatedAt(project.updatedAt)}</span>
                  </div>
                  <p>{project.summary}</p>
                  <p className="project-card-preview">{project.transcriptPreview}</p>
                  <div className="project-card-meta">
                    <span>{formatCount("section", project.sectionCount)}</span>
                    <span>{formatCount("node", project.nodeCount)}</span>
                    <span>{formatCount("edge", project.edgeCount)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function App(): React.JSX.Element {
  const [transcript, setTranscript] = useState(starterTranscript);
  const [mapTranscript, setMapTranscript] = useState(starterTranscript);
  const [map, setMap] = useState<TranscriptMap | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [positionOverrides, setPositionOverrides] = useState<NodePositionOverrides>({});
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsError, setProjectsError] = useState("");
  const [persistenceUnavailableReason, setPersistenceUnavailableReason] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null);

  const selectedNode = map ? resolveSelectedNode(map, selectedNodeId) : null;
  const transcriptDraftChanged = map !== null && transcript.trim() !== mapTranscript.trim();

  useEffect(() => {
    void loadProjects();
  }, []);

  async function loadProjects(options?: { silent?: boolean }): Promise<void> {
    if (!options?.silent) {
      setIsLoadingProjects(true);
    }

    setProjectsError("");

    try {
      const response = await fetch("/api/projects");
      const payload = (await response.json()) as ProjectsApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && typeof payload.error === "string"
            ? payload.error
            : "Unable to load saved projects."
        );
      }

      setProjects(payload.data);
      setPersistenceUnavailableReason("");
    } catch (loadError: unknown) {
      const message =
        loadError instanceof Error ? loadError.message : "Unable to load saved projects.";

      if (isPersistenceUnavailableError(message)) {
        setPersistenceUnavailableReason(message);
        setProjects([]);
      } else {
        setProjectsError(message);
      }
    } finally {
      setIsLoadingProjects(false);
    }
  }

  function hydrateProject(project: SavedProject): void {
    setTranscript(project.transcript);
    setMapTranscript(project.transcript);
    setPositionOverrides(project.positionOverrides);
    setSelectedNodeId(project.selectedNodeId ?? project.map.thesisNodeId);
    setActiveProjectId(project.id);
    startTransition(() => {
      setMap(project.map);
    });
  }

  async function handleOpenProject(projectId: string): Promise<void> {
    setOpeningProjectId(projectId);
    setError("");
    setStatus("Opening saved project...");

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
      const payload = (await response.json()) as ProjectApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && typeof payload.error === "string" ? payload.error : "Unable to open project."
        );
      }

      hydrateProject(payload.data);
      setStatus(`Reopened "${payload.data.title}".`);
    } catch (openError: unknown) {
      const message = openError instanceof Error ? openError.message : "Unable to open project.";
      setError(message);
      setStatus("");

      if (isPersistenceUnavailableError(message)) {
        setPersistenceUnavailableReason(message);
      }
    } finally {
      setOpeningProjectId(null);
    }
  }

  async function handleSaveProject(): Promise<void> {
    if (!map) {
      return;
    }

    setIsSavingProject(true);
    setError("");
    setStatus(activeProjectId ? "Saving project updates..." : "Saving project...");

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: activeProjectId,
          transcript: mapTranscript,
          map,
          positionOverrides,
          selectedNodeId
        })
      });
      const payload = (await response.json()) as ProjectApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && typeof payload.error === "string" ? payload.error : "Unable to save project."
        );
      }

      hydrateProject(payload.data);
      await loadProjects({ silent: true });
      setStatus(`Saved "${payload.data.title}".`);
    } catch (saveError: unknown) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save project.";
      setError(message);
      setStatus("");

      if (isPersistenceUnavailableError(message)) {
        setPersistenceUnavailableReason(message);
      }
    } finally {
      setIsSavingProject(false);
    }
  }

  function updateSelectedNode(
    updater: (node: TranscriptMapNode) => TranscriptMapNode
  ): void {
    if (!map || !selectedNode) {
      return;
    }

    setMap(updateNodeInMap(map, selectedNode.id, updater));
  }

  function handleDeleteSelectedNode(): void {
    if (!map || !selectedNode || selectedNode.id === map.thesisNodeId) {
      return;
    }

    const nextMap = deleteNodeFromMap(map, selectedNode.id);
    const { [selectedNode.id]: _, ...remainingPositionOverrides } = positionOverrides;

    setMap(nextMap);
    setPositionOverrides(remainingPositionOverrides);
    setSelectedNodeId(resolveSelectedNode(nextMap, map.thesisNodeId)?.id ?? null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedTranscript = transcript.trim();

    if (!normalizedTranscript) {
      setError("Paste a transcript before submitting.");
      return;
    }

    setIsLoading(true);
    setError("");
    setStatus("Extracting structure from the transcript...");

    try {
      const response = await fetch("/api/transcript-map", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          transcript: normalizedTranscript
        })
      });

      const payload = (await response.json()) as MapApiResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(
          !payload.ok && typeof payload.error === "string"
            ? payload.error
            : "Something went wrong while building the graph."
        );
      }

      setStatus("Transcript graph extracted.");
      setActiveProjectId(null);
      setMapTranscript(normalizedTranscript);
      setPositionOverrides({});
      setSelectedNodeId(payload.data.thesisNodeId);
      startTransition(() => {
        setMap(payload.data);
      });
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : "Unexpected error.");
      setStatus("");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Transcript to graph</p>
        <h1>Paste text. Render the first mind map.</h1>
        <p className="hero-copy">
          This version turns the core flow into something you can keep using: React Flow renders
          the graph, D3 lays it out, and useful maps can now be saved and reopened.
        </p>
      </section>

      <section className="workspace-grid">
        <section className="panel composer">
          <form onSubmit={handleSubmit}>
            <label htmlFor="transcript-input">
              Transcript
              <span className="label-note">
                Paste plain text. The server will call OpenAI, validate the schema, and return a
                transcript map.
              </span>
            </label>
            <textarea
              id="transcript-input"
              name="transcript"
              placeholder="Paste a transcript here..."
              spellCheck={false}
              value={transcript}
              onChange={(event) => {
                setTranscript(event.target.value);
              }}
              disabled={isLoading}
            />
            <p className="hint">
              This app uses the server-side <code>OPENAI_API_KEY</code>. Signing into ChatGPT in a
              browser does not authenticate API requests for this project.
            </p>
            {transcriptDraftChanged ? (
              <p className="hint">
                The composer text no longer matches the open map. Build a new graph to analyze this
                draft, or save to preserve the currently open project state.
              </p>
            ) : null}
            <div className="controls">
              <button id="submit-button" type="submit" disabled={isLoading}>
                {isLoading ? "Building graph..." : "Build graph"}
              </button>
              <p className="status" role="status" hidden={!status}>
                {status}
              </p>
              <p className="error" role="alert" hidden={!error}>
                {error}
              </p>
            </div>
          </form>
        </section>

        <ProjectLibrary
          projects={projects}
          activeProjectId={activeProjectId}
          isLoadingProjects={isLoadingProjects}
          openingProjectId={openingProjectId}
          persistenceUnavailableReason={persistenceUnavailableReason}
          projectsError={projectsError}
          onOpenProject={handleOpenProject}
        />
      </section>

      {map ? (
        <section className="panel result">
          <div className="result-head">
            <div className="result-head-row">
              <div>
                <h2>{map.title}</h2>
                <p className="hero-copy">{map.summary}</p>
              </div>
              <div className="result-actions">
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveProject();
                  }}
                  disabled={isSavingProject || Boolean(persistenceUnavailableReason)}
                >
                  {isSavingProject
                    ? "Saving..."
                    : activeProjectId
                      ? "Save project"
                      : "Save as project"}
                </button>
                <span className="pill pill--muted">
                  {activeProjectId ? "Saved project" : "Unsaved session"}
                </span>
              </div>
            </div>
            <div className="result-meta">
              <span className="pill">{formatCount("section", map.sections.length)}</span>
              <span className="pill">{formatCount("node", map.nodes.length)}</span>
              <span className="pill">{formatCount("edge", map.edges.length)}</span>
              <span className="pill">{map.source.transcriptLengthChars} chars</span>
            </div>
          </div>

          <GraphView
            map={map}
            selectedNodeId={selectedNodeId}
            positionOverrides={positionOverrides}
            onSelectNode={setSelectedNodeId}
            onMoveNode={(nodeId, position) => {
              setPositionOverrides((currentOverrides) => ({
                ...currentOverrides,
                [nodeId]: position
              }));
            }}
            onRenameNode={(value) => {
              updateSelectedNode((node) => ({
                ...node,
                label: value
              }));
            }}
            onUpdateSummary={(value) => {
              updateSelectedNode((node) => ({
                ...node,
                summary: value
              }));
            }}
            onUpdateType={(value) => {
              updateSelectedNode((node) => ({
                ...node,
                type: value
              }));
            }}
            onDeleteNode={handleDeleteSelectedNode}
          />

          <section className="edge-summary">
            <h3>Extracted relationships</h3>
            <ul className="edge-list">
              {map.edges.length > 0 ? (
                map.edges.map((edge) => {
                  const sourceLabel = map.nodes.find((node) => node.id === edge.source)?.label ?? edge.source;
                  const targetLabel = map.nodes.find((node) => node.id === edge.target)?.label ?? edge.target;

                  return (
                    <li key={edge.id}>
                      <strong>{sourceLabel}</strong>{" "}
                      <span>
                        {edge.relationship} -&gt; {targetLabel}
                      </span>{" "}
                      {edge.explanation ? <span>{edge.explanation}</span> : null}
                    </li>
                  );
                })
              ) : (
                <li>
                  <span>No explicit edges were returned for this transcript.</span>
                </li>
              )}
            </ul>
          </section>

          <details className="json-card">
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(map, null, 2)}</pre>
          </details>
        </section>
      ) : null}
    </>
  );
}

const rootElement = document.getElementById("app-root");

if (!rootElement) {
  throw new Error("Unable to find app root.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
