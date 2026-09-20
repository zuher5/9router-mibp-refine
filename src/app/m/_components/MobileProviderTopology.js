"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import {
  ReactFlow,
  Handle,
  Position,
  BaseEdge,
  getBezierPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc } from "@/shared/utils/providerIcon";

const KAME_PARTICLE_COUNT = 4;

function getProviderConfig(providerId) {
  return AI_PROVIDERS[providerId] || { color: "#6b7280", name: providerId };
}

// Node Provider ukuran compact untuk layar HP (130px x 28px)
function MobileProviderNode({ data }) {
  const { label, color, imageUrl, textIcon, active, onClick } = data;
  const [imgError, setImgError] = useState(false);

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all duration-200 bg-bg active:scale-95 cursor-pointer select-none"
      style={{
        borderColor: active ? color : "var(--color-border)",
        boxShadow: active ? `0 0 12px ${color}35` : "none",
        minWidth: "125px",
        maxWidth: "145px",
      }}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      {/* Provider icon badge */}
      <div
        className="w-6 h-6 rounded flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}18` }}
      >
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={label}
            className="w-4 h-4 rounded-sm object-contain"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-[10px] font-bold" style={{ color }}>{textIcon}</span>
        )}
      </div>

      {/* Provider name */}
      <span
        className="text-xs font-semibold truncate flex-1"
        style={{ color: active ? color : "var(--color-text)" }}
      >
        {label}
      </span>

      {/* Pulse dot */}
      {active && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
        </span>
      )}
    </div>
  );
}

MobileProviderNode.propTypes = {
  data: PropTypes.object.isRequired,
};

// Center Router Node compact
function MobileRouterNode({ data }) {
  const powering = (data.activeCount || 0) > 0;
  return (
    <div
      className={`relative z-[1] flex items-center justify-center px-3.5 py-2 rounded-xl border min-w-[100px] select-none ${
        powering
          ? "border-yellow-300 bg-gradient-to-br from-primary/30 via-yellow-400/20 to-cyan-400/25"
          : "border-primary bg-primary/5"
      }`}
    >
      <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      <span className={`text-xs font-bold ${powering ? "text-yellow-300" : "text-primary"}`}>
        9Router
      </span>
      {data.activeCount > 0 && (
        <span className="ml-1.5 px-1 py-0.2 rounded-full bg-yellow-400 text-black text-[10px] font-black">
          {data.activeCount}
        </span>
      )}
    </div>
  );
}

MobileRouterNode.propTypes = {
  data: PropTypes.object.isRequired,
};

// Mobile Kame Beam Edge
function MobileTopologyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const active = !!data?.active;
  const stroke = style.stroke || "var(--color-border)";

  if (!active) {
    return <BaseEdge id={id} path={edgePath} style={{ ...style, stroke }} />;
  }

  return (
    <g>
      <path
        d={edgePath}
        fill="none"
        stroke="#22d3ee"
        strokeWidth={7}
        strokeOpacity={0.35}
        strokeLinecap="round"
      />
      <path
        d={edgePath}
        fill="none"
        stroke="#4ade80"
        strokeWidth={3.5}
        strokeOpacity={0.85}
        strokeLinecap="round"
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: "#f8fafc", strokeWidth: 1.8, opacity: 1 }}
      />
      {Array.from({ length: KAME_PARTICLE_COUNT }, (_, i) => (
        <circle
          key={`${id}-p-${i}`}
          r={i % 2 === 0 ? 3 : 2}
          fill={i % 2 === 0 ? "#fde047" : "#67e8f9"}
          opacity={0.95}
        >
          <animateMotion
            dur={`${0.6 + i * 0.12}s`}
            repeatCount="indefinite"
            path={edgePath}
            begin={`${i * 0.15}s`}
          />
        </circle>
      ))}
    </g>
  );
}

MobileTopologyEdge.propTypes = {
  id: PropTypes.string,
  sourceX: PropTypes.number,
  sourceY: PropTypes.number,
  targetX: PropTypes.number,
  targetY: PropTypes.number,
  sourcePosition: PropTypes.string,
  targetPosition: PropTypes.string,
  style: PropTypes.object,
  data: PropTypes.object,
};

const nodeTypes = { provider: MobileProviderNode, router: MobileRouterNode };
const edgeTypes = { topology: MobileTopologyEdge };

function buildMobileLayout(providers, activeSet, lastSet, errorSet, onSelectProvider) {
  const count = providers.length;
  const nodeW = 135;
  const nodeH = 28;
  const routerW = 100;
  const routerH = 36;
  const nodeGap = 16;

  // Ukuran elips pas untuk layar portrait mobile (rx ~ 190, ry ~ 115)
  const minRx = ((nodeW + nodeGap) * count) / (2 * Math.PI);
  const rx = Math.max(180, minRx);
  const ry = Math.max(110, rx * 0.58);

  const nodes = [];
  const edges = [];

  nodes.push({
    id: "router",
    type: "router",
    position: { x: -routerW / 2, y: -routerH / 2 },
    data: { activeCount: activeSet.size },
    draggable: false,
  });

  const edgeStyle = (active, last, error) => {
    if (error) return { stroke: "#ef4444", strokeWidth: 2.2, opacity: 0.95 };
    if (active) return { stroke: "#22d3ee", strokeWidth: 2.8, opacity: 1 };
    if (last) return { stroke: "#f59e0b", strokeWidth: 1.8, opacity: 0.8 };
    return { stroke: "var(--color-border)", strokeWidth: 1.2, opacity: 0.5 };
  };

  providers.forEach((p, i) => {
    const config = getProviderConfig(p.provider);
    const active = activeSet.has(p.provider?.toLowerCase());
    const last = !active && lastSet.has(p.provider?.toLowerCase());
    const error = !active && errorSet.has(p.provider?.toLowerCase());
    const nodeId = `provider-${p.provider}`;

    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    const cx = rx * Math.cos(angle);
    const cy = ry * Math.sin(angle);

    let sourceHandle, targetHandle;
    if (Math.abs(angle + Math.PI / 2) < Math.PI / 4 || Math.abs(angle - 3 * Math.PI / 2) < Math.PI / 4) {
      sourceHandle = "top"; targetHandle = "bottom";
    } else if (Math.abs(angle - Math.PI / 2) < Math.PI / 4) {
      sourceHandle = "bottom"; targetHandle = "top";
    } else if (cx > 0) {
      sourceHandle = "right"; targetHandle = "left";
    } else {
      sourceHandle = "left"; targetHandle = "right";
    }

    nodes.push({
      id: nodeId,
      type: "provider",
      position: { x: cx - nodeW / 2, y: cy - nodeH / 2 },
      data: {
        label: config.name || p.provider,
        color: config.color || "#6b7280",
        imageUrl: getProviderIconSrc(p.provider),
        textIcon: config.textIcon || (p.provider || "?").slice(0, 2).toUpperCase(),
        active,
        onClick: () => onSelectProvider?.(p),
      },
      draggable: false,
    });

    edges.push({
      id: `e-${nodeId}`,
      type: "topology",
      source: "router",
      sourceHandle,
      target: nodeId,
      targetHandle,
      animated: false,
      data: { active },
      style: edgeStyle(active, last, error),
    });
  });

  return { nodes, edges };
}

export default function MobileProviderTopology({
  providers = [],
  activeRequests = [],
  lastProvider = "",
  errorProvider = "",
  onSelectProvider,
}) {
  const activeSet = useMemo(
    () => new Set(activeRequests.map((r) => r.provider?.toLowerCase()).filter(Boolean)),
    [activeRequests]
  );
  const lastSet = useMemo(() => new Set(lastProvider ? [lastProvider.toLowerCase()] : []), [lastProvider]);
  const errorSet = useMemo(() => new Set(errorProvider ? [errorProvider.toLowerCase()] : []), [errorProvider]);

  const { nodes, edges } = useMemo(
    () => buildMobileLayout(providers, activeSet, lastSet, errorSet, onSelectProvider),
    [providers, activeSet, lastSet, errorSet, onSelectProvider]
  );

  const rfInstance = useRef(null);
  const onInit = useCallback((instance) => {
    rfInstance.current = instance;
    setTimeout(() => instance.fitView({ padding: 0.12, duration: 250 }), 40);
  }, []);

  return (
    <div className="relative w-full h-[310px] rounded-xl border border-border bg-bg/60 overflow-hidden shadow-inner">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={onInit}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.5}
        maxZoom={2.2}
        panOnDrag={[2]} // Gestur: drag 2 jari agar scroll 1 jari tetap bebas scrolling halaman
        zoomOnPinch={true}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      />
      
      {/* Petunjuk interaksi mini */}
      <div className="absolute top-2 left-2 pointer-events-none px-2 py-0.5 rounded bg-bg/80 border border-border/50 text-[10px] text-text-muted">
        Tap node for details
      </div>

      {/* Tombol Fit Reset di pojok kiri bawah */}
      <div className="absolute bottom-2 left-2 flex gap-1 z-10">
        <button
          type="button"
          onClick={() => rfInstance.current?.fitView({ padding: 0.12, duration: 200 })}
          className="p-1.5 rounded-md bg-bg/90 border border-border text-text-muted hover:text-text shadow-sm"
          title="Reset View"
        >
          <span className="material-symbols-outlined text-[16px] leading-none">center_focus_strong</span>
        </button>
      </div>
    </div>
  );
}

MobileProviderTopology.propTypes = {
  providers: PropTypes.array,
  activeRequests: PropTypes.array,
  lastProvider: PropTypes.string,
  errorProvider: PropTypes.string,
  onSelectProvider: PropTypes.func,
};
