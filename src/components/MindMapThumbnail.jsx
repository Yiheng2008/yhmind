function MindMapThumbnail({ nodes = [], edges = [] }) {
  if (!nodes.length) {
    return (
      <div className="mindmap-thumbnail-empty">
        空白导图
      </div>
    );
  }

  const padding = 20;

  const xs = nodes.map((node) => node.position?.x || 0);
  const ys = nodes.map((node) => node.position?.y || 0);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = Math.max(maxX - minX + 160, 160);
  const height = Math.max(maxY - minY + 80, 80);

  const getX = (x) => x - minX + padding;
  const getY = (y) => y - minY + padding;

  return (
    <div className="mindmap-thumbnail">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* 连线 */}
        {edges.map((edge) => {
          const source = nodes.find(
            (node) => node.id === edge.source
          );

          const target = nodes.find(
            (node) => node.id === edge.target
          );

          if (!source || !target) return null;

          return (
            <line
              key={edge.id}
              x1={getX(source.position?.x || 0) + 80}
              y1={getY(source.position?.y || 0) + 20}
              x2={getX(target.position?.x || 0)}
              y2={getY(target.position?.y || 0) + 20}
              stroke="#b8b8b8"
              strokeWidth="2"
            />
          );
        })}

        {/* 节点 */}
        {nodes.map((node) => (
          <rect
            key={node.id}
            x={getX(node.position?.x || 0)}
            y={getY(node.position?.y || 0)}
            width="80"
            height="40"
            rx="8"
            fill={node.data?.color || "#ffffff"}
            stroke="#b8b8b8"
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </div>
  );
}

export default MindMapThumbnail;