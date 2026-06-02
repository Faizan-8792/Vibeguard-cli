import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphData, GraphNode } from './graph-builder.js';

/**
 * Generates an interactive HTML graph visualization using vis.js (CDN).
 * The output is a self-contained HTML file that can be opened in any browser.
 */
export async function generateHTMLGraph(
  projectRoot: string,
  graphData: GraphData,
  outputPath?: string,
): Promise<string> {
  const nodes = Object.values(graphData.nodes);
  const filePath = outputPath ?? join(projectRoot, '.vibeguard', 'graph.html');

  // Build vis.js data
  const visNodes = nodes.map((node, i) => ({
    id: node.file,
    label: shortenLabel(node.file),
    title: buildTooltip(node),
    group: getGroup(node.file),
    value: node.dependents.length + node.imports.length + 1,
  }));

  const visEdges: Array<{ from: string; to: string }> = [];
  const seenEdges = new Set<string>();
  for (const node of nodes) {
    for (const imp of node.imports) {
      // Resolve .js → .ts for display
      const resolved = resolveTarget(imp, graphData);
      if (resolved && resolved !== node.file) {
        const key = `${node.file}→${resolved}`;
        if (!seenEdges.has(key)) {
          seenEdges.add(key);
          visEdges.push({ from: node.file, to: resolved });
        }
      }
    }
  }

  const html = buildHTML(visNodes, visEdges, nodes.length, visEdges.length);
  await writeFile(filePath, html, 'utf-8');
  return filePath;
}

function shortenLabel(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 2) return path;
  return parts.slice(-2).join('/');
}

function buildTooltip(node: GraphNode): string {
  return `<b>${node.file}</b><br/>` +
    `Imports: ${node.imports.length}<br/>` +
    `Dependents: ${node.dependents.length}<br/>` +
    `Exports: ${node.exports.join(', ') || 'none'}`;
}

function getGroup(file: string): string {
  if (file.includes('/commands/')) return 'commands';
  if (file.includes('/engines/')) return 'engines';
  if (file.includes('/storage/')) return 'storage';
  if (file.includes('/utils/')) return 'utils';
  if (file.includes('test/') || file.includes('.test.')) return 'tests';
  return 'core';
}

function resolveTarget(imp: string, graphData: GraphData): string | null {
  if (graphData.nodes[imp]) return imp;
  const tsVariant = imp.replace(/\.js$/, '.ts').replace(/\.mjs$/, '.ts');
  if (graphData.nodes[tsVariant]) return tsVariant;
  const tsxVariant = imp.replace(/\.js$/, '.tsx');
  if (graphData.nodes[tsxVariant]) return tsxVariant;
  return null;
}

function buildHTML(
  nodes: Array<{ id: string; label: string; title: string; group: string; value: number }>,
  edges: Array<{ from: string; to: string }>,
  nodeCount: number,
  edgeCount: number,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VibeGuard — Dependency Graph</title>
  <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      background: #0f0f23;
      color: #e0e0e0;
      height: 100vh;
      overflow: hidden;
    }
    #header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #7c3aed33;
    }
    #header h1 {
      font-size: 18px;
      color: #7c3aed;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #header .stats {
      font-size: 13px;
      color: #6b7280;
    }
    #header .stats span {
      color: #06b6d4;
      font-weight: bold;
    }
    #controls {
      padding: 12px 24px;
      background: #1a1a2e;
      display: flex;
      gap: 12px;
      align-items: center;
      border-bottom: 1px solid #ffffff11;
    }
    #controls input {
      background: #0f0f23;
      border: 1px solid #333;
      border-radius: 6px;
      padding: 8px 14px;
      color: #e0e0e0;
      font-size: 13px;
      width: 300px;
      outline: none;
    }
    #controls input:focus { border-color: #7c3aed; }
    #controls button {
      background: #7c3aed;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
    }
    #controls button:hover { background: #6d28d9; }
    .legend {
      display: flex;
      gap: 16px;
      margin-left: auto;
      font-size: 12px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    #graph { width: 100%; height: calc(100vh - 110px); }
    #tooltip {
      position: absolute;
      background: #1a1a2e;
      border: 1px solid #7c3aed;
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.5;
      display: none;
      z-index: 100;
      max-width: 300px;
      box-shadow: 0 4px 20px rgba(124, 58, 237, 0.3);
    }
  </style>
</head>
<body>
  <div id="header">
    <h1>🛡️ VibeGuard — Dependency Graph</h1>
    <div class="stats">
      <span>${nodeCount}</span> nodes &nbsp;•&nbsp; <span>${edgeCount}</span> edges &nbsp;•&nbsp; Generated ${new Date().toLocaleDateString()}
    </div>
  </div>
  <div id="controls">
    <input type="text" id="search" placeholder="🔍 Search files..." />
    <button onclick="resetView()">Reset View</button>
    <button onclick="togglePhysics()">Toggle Physics</button>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:#7c3aed"></div>Core</div>
      <div class="legend-item"><div class="legend-dot" style="background:#06b6d4"></div>Commands</div>
      <div class="legend-item"><div class="legend-dot" style="background:#10b981"></div>Engines</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div>Storage</div>
      <div class="legend-item"><div class="legend-dot" style="background:#6b7280"></div>Utils</div>
    </div>
  </div>
  <div id="graph"></div>
  <div id="tooltip"></div>

  <script>
    const nodesData = ${JSON.stringify(nodes)};
    const edgesData = ${JSON.stringify(edges)};

    const groupColors = {
      core: { background: '#7c3aed', border: '#6d28d9', highlight: { background: '#9333ea', border: '#7c3aed' } },
      commands: { background: '#06b6d4', border: '#0891b2', highlight: { background: '#22d3ee', border: '#06b6d4' } },
      engines: { background: '#10b981', border: '#059669', highlight: { background: '#34d399', border: '#10b981' } },
      storage: { background: '#f59e0b', border: '#d97706', highlight: { background: '#fbbf24', border: '#f59e0b' } },
      utils: { background: '#6b7280', border: '#4b5563', highlight: { background: '#9ca3af', border: '#6b7280' } },
      tests: { background: '#374151', border: '#1f2937', highlight: { background: '#4b5563', border: '#374151' } },
    };

    const nodes = new vis.DataSet(nodesData.map(n => ({
      ...n,
      color: groupColors[n.group] || groupColors.core,
      font: { color: '#e0e0e0', size: 12 },
      shape: 'dot',
      scaling: { min: 8, max: 30 },
    })));

    const edges = new vis.DataSet(edgesData.map(e => ({
      ...e,
      arrows: 'to',
      color: { color: '#ffffff22', highlight: '#7c3aed' },
      smooth: { type: 'cubicBezier', roundness: 0.4 },
    })));

    const container = document.getElementById('graph');
    const network = new vis.Network(container, { nodes, edges }, {
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -80, springLength: 120 },
        stabilization: { iterations: 200 },
      },
      interaction: { hover: true, tooltipDelay: 200, zoomView: true },
      layout: { improvedLayout: true },
    });

    let physicsEnabled = true;

    function resetView() { network.fit({ animation: true }); }

    function togglePhysics() {
      physicsEnabled = !physicsEnabled;
      network.setOptions({ physics: { enabled: physicsEnabled } });
    }

    // Search
    document.getElementById('search').addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      if (!query) {
        nodes.forEach(n => nodes.update({ id: n.id, opacity: 1 }));
        return;
      }
      nodes.forEach(n => {
        const match = n.id.toLowerCase().includes(query) || n.label.toLowerCase().includes(query);
        nodes.update({ id: n.id, opacity: match ? 1 : 0.15 });
      });
      const matches = nodes.get().filter(n => n.id.toLowerCase().includes(query));
      if (matches.length === 1) {
        network.focus(matches[0].id, { scale: 1.5, animation: true });
      }
    });

    // Click to highlight connections
    network.on('click', function(params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const connected = network.getConnectedNodes(nodeId);
        nodes.forEach(n => {
          const isConnected = connected.includes(n.id) || n.id === nodeId;
          nodes.update({ id: n.id, opacity: isConnected ? 1 : 0.15 });
        });
      } else {
        nodes.forEach(n => nodes.update({ id: n.id, opacity: 1 }));
      }
    });
  </script>
</body>
</html>`;
}
