import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GraphData, GraphNode } from './graph-builder.js';

/**
 * Generates an interactive 3D dependency-graph visualization using
 * `3d-force-graph` (Three.js / WebGL, loaded from CDN). The output is a
 * self-contained HTML file that opens in any browser.
 *
 * Interaction model (no continuous auto-rotation / drift):
 *  - Hold and drag        → orbit/rotate the graph in 3D
 *  - Scroll wheel         → zoom in / out
 *  - Hover a node         → tooltip with imports / dependents / exports
 *  - Search / Reset View  → focus a node / fit the whole graph
 *
 * The force simulation runs briefly to lay the graph out, then freezes, so the
 * scene only moves when the user interacts with it.
 */
export async function generateHTMLGraph(
  projectRoot: string,
  graphData: GraphData,
  outputPath?: string,
): Promise<string> {
  const nodes = Object.values(graphData.nodes);
  const filePath = outputPath ?? join(projectRoot, '.vibeguard', 'graph.html');

  const graphNodes = nodes.map((node) => ({
    id: node.file,
    label: shortenLabel(node.file),
    title: buildTooltip(node),
    group: getGroup(node.file),
    value: node.dependents.length + node.imports.length + 1,
  }));

  const links: Array<{ source: string; target: string }> = [];
  const seenEdges = new Set<string>();
  for (const node of nodes) {
    for (const imp of node.imports) {
      const resolved = resolveTarget(imp, graphData);
      if (resolved && resolved !== node.file) {
        const key = `${node.file}→${resolved}`;
        if (!seenEdges.has(key)) {
          seenEdges.add(key);
          links.push({ source: node.file, target: resolved });
        }
      }
    }
  }

  const html = buildHTML(graphNodes, links, nodes.length, links.length);
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
  if (file.includes('/mcp/')) return 'mcp';
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
  links: Array<{ source: string; target: string }>,
  nodeCount: number,
  edgeCount: number,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VibeGuard — 3D Dependency Graph</title>
  <script src="https://unpkg.com/three-spritetext"></script>
  <script src="https://unpkg.com/3d-force-graph"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      background: #0f0f23;
      color: #e0e0e0;
    }
    #header {
      position: absolute; top: 0; left: 0; right: 0; z-index: 10;
      background: linear-gradient(135deg, rgba(26,26,46,0.95) 0%, rgba(22,33,62,0.95) 100%);
      padding: 14px 22px;
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 1px solid #7c3aed33; backdrop-filter: blur(8px);
    }
    #header h1 { font-size: 17px; color: #7c3aed; display: flex; align-items: center; gap: 8px; }
    #header .stats { font-size: 12px; color: #6b7280; }
    #header .stats span { color: #06b6d4; font-weight: bold; }
    #controls {
      position: absolute; top: 64px; left: 22px; z-index: 10;
      display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    }
    #controls input {
      background: rgba(15,15,35,0.9); border: 1px solid #333; border-radius: 6px;
      padding: 7px 12px; color: #e0e0e0; font-size: 12px; width: 240px; outline: none;
    }
    #controls input:focus { border-color: #7c3aed; }
    #controls button {
      background: rgba(124,58,237,0.9); color: #fff; border: none; border-radius: 6px;
      padding: 7px 14px; cursor: pointer; font-size: 12px;
    }
    #controls button:hover { background: #6d28d9; }
    .legend {
      position: absolute; bottom: 16px; left: 22px; z-index: 10;
      display: flex; gap: 14px; font-size: 11px; flex-wrap: wrap;
      background: rgba(15,15,35,0.7); padding: 8px 14px; border-radius: 8px;
      backdrop-filter: blur(8px);
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
    #hint {
      position: absolute; bottom: 16px; right: 22px; z-index: 10;
      font-size: 11px; color: #6b7280;
      background: rgba(15,15,35,0.7); padding: 8px 14px; border-radius: 8px;
      backdrop-filter: blur(8px);
    }
    #graph { width: 100%; height: 100%; }
    .empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #6b7280; }
  </style>
</head>
<body>
  <div id="header">
    <h1>🛡️ VibeGuard — 3D Dependency Graph</h1>
    <div class="stats">
      <span>${nodeCount}</span> nodes &nbsp;•&nbsp; <span>${edgeCount}</span> edges &nbsp;•&nbsp; ${new Date().toLocaleDateString()}
    </div>
  </div>
  <div id="controls">
    <input type="text" id="search" placeholder="🔍 Search files..." autocomplete="off" />
    <button id="btn-reset">Reset View</button>
    <button id="btn-labels">Toggle Labels</button>
    <button id="btn-spin">Auto-Rotate: Off</button>
  </div>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#7c3aed"></div>Core</div>
    <div class="legend-item"><div class="legend-dot" style="background:#06b6d4"></div>Commands</div>
    <div class="legend-item"><div class="legend-dot" style="background:#10b981"></div>Engines</div>
    <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div>Storage</div>
    <div class="legend-item"><div class="legend-dot" style="background:#ec4899"></div>MCP</div>
    <div class="legend-item"><div class="legend-dot" style="background:#6b7280"></div>Utils</div>
  </div>
  <div id="hint">Drag to rotate • Scroll to zoom • Hover for details</div>
  <div id="graph"></div>

  <script>
    const graphData = {
      nodes: ${JSON.stringify(nodes)},
      links: ${JSON.stringify(links)},
    };

    const groupColors = {
      core: '#7c3aed', commands: '#06b6d4', engines: '#10b981',
      storage: '#f59e0b', mcp: '#ec4899', utils: '#6b7280', tests: '#374151',
    };

    const el = document.getElementById('graph');

    if (!graphData.nodes.length || typeof ForceGraph3D === 'undefined') {
      el.innerHTML = '<div class="empty">' +
        (graphData.nodes.length ? 'Could not load 3D renderer (offline?).' : 'No graph data. Run: vibeguard map') +
        '</div>';
    } else {
      let showLabels = true;

      const Graph = ForceGraph3D()(el)
        .backgroundColor('#0f0f23')
        .graphData(graphData)
        .nodeId('id')
        .nodeVal(n => Math.max(1, n.value))
        .nodeColor(n => groupColors[n.group] || groupColors.core)
        .nodeOpacity(0.95)
        .nodeResolution(12)
        .nodeLabel(n => '<div style="font-family:monospace;font-size:12px;background:#1a1a2e;border:1px solid #7c3aed;border-radius:6px;padding:8px 10px;color:#e0e0e0">' + n.title + '</div>')
        .linkColor(() => 'rgba(255,255,255,0.18)')
        .linkWidth(0.5)
        .linkDirectionalArrowLength(2.5)
        .linkDirectionalArrowRelPos(1)
        .linkDirectionalParticles(0)
        .enableNodeDrag(false)        // dragging always orbits the camera (no node-dragging)
        .enableNavigationControls(true)
        .showNavInfo(false)
        .cooldownTicks(120);          // settle the layout, then freeze (no perpetual drift)

      // Persistent text labels via three-spritetext (in addition to the sphere).
      function applyLabels() {
        Graph.nodeThreeObjectExtend(true).nodeThreeObject(n => {
          if (!showLabels || typeof SpriteText === 'undefined') return null;
          const sprite = new SpriteText(n.label);
          sprite.color = '#c9d1d9';
          sprite.textHeight = 3;
          sprite.position.y = -6;
          return sprite;
        });
      }
      applyLabels();

      // Explicitly disable auto-rotation — the scene is still until the user drags it.
      const controls = Graph.controls();
      if (controls) {
        controls.autoRotate = false;
        controls.enableZoom = true;   // scroll to zoom
        controls.enableRotate = true; // drag to rotate
      }

      // Fit the whole graph once the initial layout settles.
      Graph.onEngineStop(() => Graph.zoomToFit(600, 60));

      // Controls
      document.getElementById('btn-reset').addEventListener('click', () => Graph.zoomToFit(600, 60));

      document.getElementById('btn-labels').addEventListener('click', () => {
        showLabels = !showLabels;
        applyLabels();
      });

      const spinBtn = document.getElementById('btn-spin');
      spinBtn.addEventListener('click', () => {
        if (!controls) return;
        controls.autoRotate = !controls.autoRotate;
        controls.autoRotateSpeed = 1.2;
        spinBtn.textContent = 'Auto-Rotate: ' + (controls.autoRotate ? 'On' : 'Off');
      });

      // Search → focus the matching node by flying the camera to it.
      document.getElementById('search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) return;
        const match = graphData.nodes.find(n => n.id.toLowerCase().includes(q));
        if (match && match.x !== undefined) {
          const dist = 80;
          const ratio = 1 + dist / Math.hypot(match.x, match.y, match.z || 0);
          Graph.cameraPosition(
            { x: match.x * ratio, y: match.y * ratio, z: (match.z || 0) * ratio },
            match,
            1000,
          );
        }
      });

      window.addEventListener('resize', () => {
        Graph.width(window.innerWidth).height(window.innerHeight);
      });
    }
  </script>
</body>
</html>`;
}
