import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import { createClient } from "@supabase/supabase-js";

import "@xyflow/react/dist/style.css";
import "./App.css";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

/* =========================
   思维导图节点
========================= */

function MindNode({ data, selected }) {
  return (
    <div
      className={`mind-node ${selected ? "selected" : ""}`}
      style={{
        backgroundColor: data.color || "#ffffff",
      }}
    >
      <Handle type="target" position={Position.Left} />

      <div className="node-content">
        {data.imageUrl && (
  <img
    className="node-image"
    src={data.imageUrl}
    alt=""
  />
)}

        {data.emoji && (
          <span className="node-emoji">
            {data.emoji}
          </span>
        )}

        <span>{data.label}</span>
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = {
  mindNode: MindNode,
};

const defaultNodes = [
  {
    id: "root",
    type: "mindNode",
    position: { x: 450, y: 280 },
    data: {
  label: "我的思维导图",
  color: "#E8E0FF",
   },
  },
];

const defaultEdges = [];

/* =========================
   登录 / 注册
========================= */

function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);
    setMessage("");

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setMessage(error.message);
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setMessage(error.message);
        } else {
          setMessage(
            "注册成功。如果需要验证邮箱，请先完成邮箱验证。"
          );
        }
      }
    } catch (error) {
      setMessage(error.message || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-icon">Y</span>
          <span>YHMind</span>
        </div>

        <h1>{isLogin ? "欢迎回来" : "创建账号"}</h1>

        <p className="auth-subtitle">
          {isLogin
            ? "登录后继续使用你的思维导图"
            : "创建账号，开始使用 YHMind"}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? "处理中..."
              : isLogin
              ? "登录"
              : "注册"}
          </button>
        </form>

        {message && (
          <div className="auth-message">
            {message}
          </div>
        )}

        <button
          className="switch-auth"
          onClick={() => {
            setIsLogin(!isLogin);
            setMessage("");
          }}
        >
          {isLogin
            ? "还没有账号？立即注册"
            : "已经有账号？返回登录"}
        </button>
      </div>
    </div>
  );
}

/* =========================
   思维导图列表首页
========================= */

function Dashboard({ session, onOpenMap }) {
  const [mindmaps, setMindmaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [creating, setCreating] = useState(false);

const loadMindmaps = async () => {
  setLoading(true);

  const { data: maps, error: mapsError } =
    await supabase
      .from("mindmaps")
      .select(
        "id, title, is_favorite, created_at, updated_at, user_id"
      )
      .order("updated_at", {
        ascending: false,
      });

  if (mapsError) {
    console.error(mapsError);
    setLoading(false);
    return;
  }

  const { data: memberships, error: memberError } =
    await supabase
      .from("mindmap_members")
      .select("mindmap_id, role")
      .eq(
        "shared_with_email",
        session.user.email.toLowerCase()
      );

  if (memberError) {
    console.error(memberError);
  }

  const roleMap = Object.fromEntries(
    (memberships || []).map((item) => [
      item.mindmap_id,
      item.role,
    ])
  );

  const accessibleMaps = (maps || []).map((map) => ({
    ...map,
    role:
      map.user_id === session.user.id
        ? "owner"
        : roleMap[map.id] || null,
  }));

  setMindmaps(
    accessibleMaps.filter(
      (map) =>
        map.user_id === session.user.id ||
        roleMap[map.id]
    )
  );

  setLoading(false);
};

  useEffect(() => {
    loadMindmaps();
  }, [session.user.id]);

  const createMindMap = async () => {
    setCreating(true);

    const { data, error } = await supabase
      .from("mindmaps")
      .insert({
        user_id: session.user.id,
        title: "未命名思维导图",
        nodes: defaultNodes,
        edges: defaultEdges,
      })
      .select()
      .single();

    if (error) {
      console.error(error);
      alert("创建失败：" + error.message);
    } else if (data) {
      onOpenMap(data);
    }

    setCreating(false);
  };

  const deleteMindMap = async (id) => {
    const ok = window.confirm(
      "确定要删除这个思维导图吗？删除后无法恢复。"
    );

    if (!ok) return;

    const { error } = await supabase
      .from("mindmaps")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id);

    if (error) {
      alert("删除失败：" + error.message);
      return;
    }

    setMindmaps((maps) =>
      maps.filter((map) => map.id !== id)
    );
  };

  const toggleFavorite = async (map) => {
    const nextValue = !map.is_favorite;

    const { error } = await supabase
      .from("mindmaps")
      .update({
        is_favorite: nextValue,
        updated_at: new Date().toISOString(),
      })
      .eq("id", map.id)
      .eq("user_id", session.user.id);

    if (error) {
      alert("操作失败：" + error.message);
      return;
    }

    setMindmaps((maps) =>
      maps.map((item) =>
        item.id === map.id
          ? {
              ...item,
              is_favorite: nextValue,
              updated_at: new Date().toISOString(),
            }
          : item
      )
    );
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const filteredMaps = useMemo(() => {
    return mindmaps.filter((map) => {
      const matchesSearch = map.title
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesFavorite = showFavorites
        ? map.is_favorite
        : true;

      return matchesSearch && matchesFavorite;
    });
  }, [mindmaps, search, showFavorites]);

  return (
    <div className="dashboard">
      <header className="dashboard-topbar">
        <div className="logo">
          <span className="logo-icon">Y</span>
          <span>YHMind</span>
        </div>

        <div className="dashboard-user">
          <span className="user-email">
            {session.user.email}
          </span>

          <button
            className="user-button"
            onClick={logout}
            title="退出登录"
          >
            👤
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-heading">
          <div>
            <h1>我的思维导图</h1>
            <p>
              {mindmaps.length} 个思维导图
            </p>
          </div>

          <button
            className="create-map-button"
            onClick={createMindMap}
            disabled={creating}
          >
            ＋ {creating ? "创建中..." : "新建思维导图"}
          </button>
        </div>

        <div className="dashboard-tools">
          <div className="search-box">
            <span>⌕</span>
            <input
              placeholder="搜索思维导图..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <button
            className={`filter-button ${
              !showFavorites ? "active" : ""
            }`}
            onClick={() => setShowFavorites(false)}
          >
            全部
          </button>

          <button
            className={`filter-button ${
              showFavorites ? "active" : ""
            }`}
            onClick={() => setShowFavorites(true)}
          >
            ★ 收藏
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            正在加载...
          </div>
        ) : filteredMaps.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🧠</div>
            <h2>
              {showFavorites
                ? "还没有收藏的思维导图"
                : search
                ? "没有找到匹配的思维导图"
                : "还没有思维导图"}
            </h2>

            {!search && !showFavorites && (
              <button
                className="create-map-button"
                onClick={createMindMap}
              >
                ＋ 创建第一张思维导图
              </button>
            )}
          </div>
        ) : (
          <div className="mindmap-grid">
            {filteredMaps.map((map) => (
              <div
                className="mindmap-card"
                key={map.id}
                onClick={() => onOpenMap(map)}
              >
                <div className="mindmap-preview">
                  <span>🧠</span>
                </div>

                <div className="mindmap-card-body">
                  <div className="mindmap-card-title-row">
                    <h3>{map.title}</h3>

                    <button
                      className={`favorite-button ${
                        map.is_favorite
                          ? "favorited"
                          : ""
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(map);
                      }}
                      title={
                        map.is_favorite
                          ? "取消收藏"
                          : "收藏"
                      }
                    >
                      {map.is_favorite ? "★" : "☆"}
                    </button>
                  </div>

                  <div className="mindmap-card-footer">
                    <span>
                      最近修改：
                      {new Date(
                        map.updated_at
                      ).toLocaleString()}
                    </span>

                    <button
                      className="delete-map-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMindMap(map.id);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/* =========================
   思维导图编辑器
========================= */
function MindMapEditor({ session, mindmap, onBack }) {
  const isOwner =
  mindmap.user_id === session.user.id;

const canEdit =
  isOwner || mindmap.role === "editor";
  const loadShares = async () => {
  if (!isOwner) return;

  const { data, error } = await supabase
    .from("mindmap_members")
    .select("id, shared_with_email, role")
    .eq("mindmap_id", mindmap.id)
    .eq("owner_id", session.user.id);

  if (error) {
    console.error(error);
    return;
  }

  setShares(data || []);
};

const addShare = async () => {
  const email = shareEmail.trim().toLowerCase();

  if (!email) {
    alert("请输入对方邮箱");
    return;
  }

  if (email === session.user.email.toLowerCase()) {
    alert("不能分享给自己");
    return;
  }

  setShareLoading(true);

  const { error } = await supabase
    .from("mindmap_members")
    .insert({
      mindmap_id: mindmap.id,
      owner_id: session.user.id,
      shared_with_email: email,
      role: shareRole,
    });

  if (error) {
    alert("分享失败：" + error.message);
  } else {
    setShareEmail("");
    await loadShares();
  }

  setShareLoading(false);
};

const removeShare = async (shareId) => {
  const { error } = await supabase
    .from("mindmap_members")
    .delete()
    .eq("id", shareId)
    .eq("owner_id", session.user.id);

  if (error) {
    alert("取消分享失败：" + error.message);
    return;
  }

  setShares((items) =>
    items.filter((item) => item.id !== shareId)
  );
};
  const [nodes, setNodes, onNodesChange] =
    useNodesState([]);

  const [edges, setEdges, onEdgesChange] =
    useEdgesState([]);

  const [selectedNode, setSelectedNode] = useState(null);
const [selectedNodes, setSelectedNodes] = useState([]);
  const [editingNode, setEditingNode] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  const [contextMenu, setContextMenu] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
const [shareEmail, setShareEmail] = useState("");
const [shareRole, setShareRole] = useState("viewer");
const [shares, setShares] = useState([]);
const [shareLoading, setShareLoading] = useState(false);
const fileInputRef = useRef(null);
const [imageTargetNode, setImageTargetNode] =
  useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  const loadMindMap = async () => {
    setLoading(true);

    const loadedNodes =
      Array.isArray(mindmap.nodes) &&
      mindmap.nodes.length > 0
        ? mindmap.nodes
        : defaultNodes;

    const loadedEdges = Array.isArray(mindmap.edges)
      ? mindmap.edges
      : defaultEdges;

    const nodesWithImages = await Promise.all(
      loadedNodes.map(async (node) => {
        const imagePath =
          node.data?.imagePath;

        if (!imagePath) {
          return node;
        }

        const { data, error } =
          await supabase.storage
            .from("mindmap-images")
            .createSignedUrl(
              imagePath,
              60 * 60 * 24
            );

        if (error) {
          console.error(
            "图片读取失败:",
            error
          );

          return node;
        }

        return {
          ...node,
          data: {
            ...node.data,
            imageUrl:
              data?.signedUrl || null,
          },
        };
      })
    );

    setNodes(nodesWithImages);
    setEdges(loadedEdges);

    setLoading(false);
  };

  loadMindMap();
}, [mindmap.id, setNodes, setEdges]);

/* =========================
   历史记录
========================= */

const historyRef = useRef({
  past: [],
  future: [],
  current: null,
});

const historyTimerRef = useRef(null);
const isRestoringHistoryRef = useRef(false);

const saveHistoryPoint = (nextNodes, nextEdges) => {
  if (isRestoringHistoryRef.current) {
    isRestoringHistoryRef.current = false;
    historyRef.current.current = JSON.stringify({
      nodes: nextNodes,
      edges: nextEdges,
    });
    return;
  }

  const nextSnapshot = JSON.stringify({
    nodes: nextNodes,
    edges: nextEdges,
  });

  const currentSnapshot =
    historyRef.current.current;

  if (currentSnapshot === null) {
    historyRef.current.current = nextSnapshot;
    return;
  }

  if (currentSnapshot === nextSnapshot) {
    return;
  }

  historyRef.current.past.push(currentSnapshot);

  if (historyRef.current.past.length > 50) {
    historyRef.current.past.shift();
  }

  historyRef.current.current = nextSnapshot;
  historyRef.current.future = [];
};

const undo = () => {
  const history = historyRef.current;

  if (history.past.length === 0) {
    return;
  }

  clearTimeout(historyTimerRef.current);

  const previous = history.past.pop();

  if (history.current) {
    history.future.push(history.current);
  }

  history.current = previous;
  isRestoringHistoryRef.current = true;

  const snapshot = JSON.parse(previous);

  setNodes(snapshot.nodes);
  setEdges(snapshot.edges);
};

const redo = () => {
  const history = historyRef.current;

  if (history.future.length === 0) {
    return;
  }

  clearTimeout(historyTimerRef.current);

  const next = history.future.pop();

  if (history.current) {
    history.past.push(history.current);
  }

  history.current = next;
  isRestoringHistoryRef.current = true;

  const snapshot = JSON.parse(next);

  setNodes(snapshot.nodes);
  setEdges(snapshot.edges);
};
useEffect(() => {
  if (loading || !canEdit) return;

  const snapshot = JSON.stringify({
    nodes,
    edges,
  });

  if (historyRef.current.current === null) {
    historyRef.current.current = snapshot;
    return;
  }

  if (isRestoringHistoryRef.current) {
    isRestoringHistoryRef.current = false;
    historyRef.current.current = snapshot;
    return;
  }

  if (
    snapshot === historyRef.current.current
  ) {
    return;
  }

  clearTimeout(historyTimerRef.current);

  historyTimerRef.current = setTimeout(() => {
    saveHistoryPoint(nodes, edges);
  }, 400);

  return () => {
    clearTimeout(historyTimerRef.current);
  };
}, [nodes, edges, loading]);
useEffect(() => {
  if (loading || !canEdit) return;

    const timer = setTimeout(async () => {
      setSaving(true);

      const nodesToSave = nodes.map((node) => ({
  ...node,
  data: {
    ...node.data,
    imageUrl: undefined,
  },
}));

const { error } = await supabase
  .from("mindmaps")
  .update({
    nodes: nodesToSave,
    edges,
    updated_at: new Date().toISOString(),
  })
  .eq("id", mindmap.id);
 

      if (error) {
        console.error(error);
      }

      setSaving(false);
    }, 700);

    return () => clearTimeout(timer);
  }, [
    nodes,
    edges,
    loading,
    mindmap.id,
    session.user.id,
    canEdit,
  ]);
const autoArrange = () => {
  if (!canEdit) return;
  if (!nodes.length) return;

  const root = nodes.find(
    (node) => node.id === "root"
  );

  if (!root) return;

  const childrenMap = {};

  nodes.forEach((node) => {
    childrenMap[node.id] = [];
  });

  edges.forEach((edge) => {
    if (childrenMap[edge.source]) {
      childrenMap[edge.source].push(edge.target);
    }
  });

  const newPositions = {};

  const horizontalGap = 300;
  const verticalGap = 110;

  let leafIndex = 0;

  const layout = (nodeId, depth) => {
    const children = childrenMap[nodeId] || [];

    // 叶子节点
    if (children.length === 0) {
      newPositions[nodeId] = {
        x: depth * horizontalGap,
        y: leafIndex * verticalGap,
      };

      leafIndex += 1;

      return newPositions[nodeId].y;
    }

    // 先排列所有子节点
    const childYs = children.map((childId) =>
      layout(childId, depth + 1)
    );

    // 父节点放在所有子节点中间
    const minY = Math.min(...childYs);
    const maxY = Math.max(...childYs);

    newPositions[nodeId] = {
      x: depth * horizontalGap,
      y: (minY + maxY) / 2,
    };

    return newPositions[nodeId].y;
  };

  layout(root.id, 0);

  setNodes((nds) =>
    nds.map((node) => ({
      ...node,
      position:
        newPositions[node.id] || node.position,
    }))
  );
};

  const onConnect = useCallback(
  (params) => {
    if (!canEdit) return;

    setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "smoothstep",
          },
          eds
        )
      );
    },
    [setEdges, canEdit]
  );

  /* =========================
     创建节点
  ========================= */
  const createChildNode = (parentId) => {
  if (!canEdit) return;

  const parent = nodes.find(
      (node) => node.id === parentId
    );

    if (!parent) return;

    const children = nodes.filter((node) =>
      edges.some(
        (edge) =>
          edge.source === parentId &&
          edge.target === node.id
      )
    );

    const newId = `node-${Date.now()}`;

    const newNode = {
      id: newId,
      type: "mindNode",
      position: {
        x: parent.position.x + 280,
        y:
          parent.position.y +
          children.length * 100,
      },
      data: {
        label: "新节点",
        color: "#ffffff",
      },
    };

    setNodes((nds) => [...nds, newNode]);

    setEdges((eds) => [
      ...eds,
      {
        id: `edge-${parentId}-${newId}`,
        source: parentId,
        target: newId,
        type: "smoothstep",
      },
    ]);

    setSelectedNode(newId);

    setTimeout(() => {
      startEditing(newId, "新节点");
    }, 50);
  };

  const createSiblingNode = (nodeId) => {
  if (!canEdit) return;

  const currentNode = nodes.find(
      (node) => node.id === nodeId
    );

    if (!currentNode) return;

    const parentEdge = edges.find(
      (edge) => edge.target === nodeId
    );

    if (!parentEdge) {
      createChildNode(nodeId);
      return;
    }

    const parentId = parentEdge.source;

    const siblingNodes = nodes.filter((node) =>
      edges.some(
        (edge) =>
          edge.source === parentId &&
          edge.target === node.id
      )
    );

    const newId = `node-${Date.now()}`;

    const newNode = {
      id: newId,
      type: "mindNode",
      position: {
        x: currentNode.position.x,
        y:
          currentNode.position.y +
          100,
      },
      data: {
        label: "新节点",
        color: "#ffffff",
      },
    };

    const maxY = Math.max(
      ...siblingNodes.map(
        (node) => node.position.y
      ),
      currentNode.position.y
    );

    newNode.position.y = maxY + 100;

    setNodes((nds) => [...nds, newNode]);

    setEdges((eds) => [
      ...eds,
      {
        id: `edge-${parentId}-${newId}`,
        source: parentId,
        target: newId,
        type: "smoothstep",
      },
    ]);

    setSelectedNode(newId);

    setTimeout(() => {
      startEditing(newId, "新节点");
    }, 50);
  };

  /* =========================
     编辑节点
  ========================= */

  const startEditing = (nodeId, value) => {
    setEditingNode(nodeId);
    setEditingValue(value);
  };

  const finishEditing = () => {
  if (!canEdit) return;
  if (!editingNode) return;

    const value = editingValue.trim();

    if (value) {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === editingNode
            ? {
                ...node,
                data: {
                  ...node.data,
                  label: value,
                },
              }
            : node
        )
      );
    }

    setEditingNode(null);
    setEditingValue("");
  };

const deleteNodeById = (nodeId) => {
  if (!canEdit) return;

  if (!nodeId || nodeId === "root") {
    alert("中心节点不能删除");
    return;
  }

  setNodes((nds) =>
    nds.filter((node) => node.id !== nodeId)
  );

  setEdges((eds) =>
    eds.filter(
      (edge) =>
        edge.source !== nodeId &&
        edge.target !== nodeId
    )
  );

  setSelectedNode(null);
  setSelectedNodes([]);
  setContextMenu(null);
};

const deleteSelectedNodes = () => {
  if (!canEdit) return;

  if (selectedNodes.length === 0) {
    return;
  }

  const nodesToDelete = selectedNodes.filter(
    (nodeId) => nodeId !== "root"
  );

  if (nodesToDelete.length === 0) {
    alert("中心节点不能删除");
    return;
  }

  setNodes((nds) =>
    nds.filter(
      (node) => !nodesToDelete.includes(node.id)
    )
  );

  setEdges((eds) =>
    eds.filter(
      (edge) =>
        !nodesToDelete.includes(edge.source) &&
        !nodesToDelete.includes(edge.target)
    )
  );

  setSelectedNode(null);
  setSelectedNodes([]);
  setContextMenu(null);
};

  const changeEmoji = (nodeId) => {
  if (!canEdit) return;

  const node = nodes.find(
      (item) => item.id === nodeId
    );

    if (!node) return;

    const emoji = window.prompt(
      "输入 Emoji",
      node.data.emoji || "✨"
    );

    if (emoji === null) return;

    setNodes((nds) =>
      nds.map((item) =>
        item.id === nodeId
          ? {
              ...item,
              data: {
                ...item.data,
                emoji,
              },
            }
          : item
      )
    );

    setContextMenu(null);
  };

  const changeColor = (nodeId) => {
  if (!canEdit) return;

  const node = nodes.find(
      (item) => item.id === nodeId
    );

    if (!node) return;

    const color = window.prompt(
      "请输入颜色，例如 #FFE4E1",
      node.data.color || "#ffffff"
    );

    if (!color) return;

    setNodes((nds) =>
      nds.map((item) =>
        item.id === nodeId
          ? {
              ...item,
              data: {
                ...item.data,
                color,
              },
            }
          : item
      )
    );

    setContextMenu(null);
  };
const uploadImage = async (nodeId, file) => {
  if (!canEdit) return;
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("请选择图片文件");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("图片不能超过 5MB");
    return;
  }

  try {
    setSaving(true);

    const fileExt =
      file.name.split(".").pop() || "png";

    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${fileExt}`;

    const filePath =
      `${session.user.id}/${fileName}`;

    // 1. 上传文件
    const { error: uploadError } =
      await supabase.storage
        .from("mindmap-images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

    if (uploadError) {
      throw uploadError;
    }

    // 2. 立即生成签名 URL，让当前页面可以显示
    const { data: signedData, error: signError } =
      await supabase.storage
        .from("mindmap-images")
        .createSignedUrl(
          filePath,
          60 * 60 * 24
        );

    if (signError) {
      throw signError;
    }

    // 3. 保存路径 + 当前可访问 URL
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                imagePath: filePath,
                imageUrl:
                  signedData?.signedUrl || null,
              },
            }
          : node
      )
    );

  } catch (error) {
    console.error(error);

    alert(
      "图片上传失败：" +
        (error.message || "未知错误")
    );
  } finally {
    setSaving(false);
  }
};
  /* =========================
     键盘快捷键
  ========================= */

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (editingNode) {
        if (event.key === "Enter") {
          event.preventDefault();
          finishEditing();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setEditingNode(null);
          setEditingValue("");
        }

        return;
      }

      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
if (event.ctrlKey && event.key.toLowerCase() === "z") {
  event.preventDefault();

  if (event.shiftKey) {
    redo();
  } else {
    undo();
  }

  return;
}


      if (!selectedNode) return;

      if (event.key === "Tab") {
        event.preventDefault();
        createChildNode(selectedNode);
      }

      if (event.key === "Enter") {
        event.preventDefault();
        createSiblingNode(selectedNode);
      }

      if (
  event.key === "Delete" ||
  event.key === "Backspace"
) {
  event.preventDefault();

  if (selectedNodes.length > 1) {
    deleteSelectedNodes();
  } else if (selectedNode) {
    deleteNodeById(selectedNode);
  }

  return;
}

      if (event.key === "F2") {
        event.preventDefault();

        const node = nodes.find(
          (item) => item.id === selectedNode
        );

        if (node) {
          startEditing(
            node.id,
            node.data.label
          );
        }
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
  selectedNode,
  selectedNodes,
  editingNode,
  editingValue,
  nodes,
  edges,
]);

  /* =========================
     右键菜单
  ========================= */

  const handleNodeContextMenu = (event, node) => {
    event.preventDefault();

    setSelectedNode(node.id);

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
    });
  };

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null);
    };

    window.addEventListener(
      "click",
      closeMenu
    );

    return () => {
      window.removeEventListener(
        "click",
        closeMenu
      );
    };
  }, []);

  /* =========================
     标题
  ========================= */

  const renameMap = async () => {
    if (!isOwner) return;

    const newTitle = window.prompt(
      "请输入思维导图名称",
      mindmap.title
    );

    if (!newTitle || !newTitle.trim()) {
      return;
    }

    const { error } = await supabase
      .from("mindmaps")
      .update({
        title: newTitle.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", mindmap.id)
      .eq("user_id", session.user.id);

    if (error) {
      alert("修改失败：" + error.message);
      return;
    }

    mindmap.title = newTitle.trim();
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
  return (
    <div className="loading-screen">
      正在加载思维导图...
    </div>
  );
}


return (
    <div
      className="app"
      onContextMenu={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
    >
      <header className="topbar">
        <div className="editor-left">
          <button
            className="back-button"
            onClick={onBack}
          >
            ←
          </button>

          <div className="logo">
            <span className="logo-icon">Y</span>
            <span>YHMind</span>
          </div>
        </div>

        <button
          className="document-title"
          onClick={renameMap}
          title="点击重命名"
        >
          {mindmap.title}
        </button>

        <div className="top-actions">
          <span className="save-status">
            {saving ? "保存中..." : "已保存"}
          </span>

          <button
  onClick={() => {
    setShareOpen(true);
    loadShares();
  }}
>
  分享
</button>

          <button
            className="user-button"
            onClick={logout}
            title="退出登录"
          >
            👤
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="toolbar">
          <button
            className="tool-button primary"
            onClick={() => {
              if (!selectedNode) {
                alert("请先选择一个节点");
                return;
              }

              createChildNode(selectedNode);
            }}
            title="添加子节点"
          >
            <span>＋</span>
            <small>节点</small>
          </button>

          <button
            className="tool-button"
            onClick={() => {
              if (!selectedNode) return;

              const node = nodes.find(
                (item) =>
                  item.id === selectedNode
              );

              if (node) {
                startEditing(
                  node.id,
                  node.data.label
                );
              }
            }}
            title="编辑节点"
          >
            <span>✎</span>
            <small>编辑</small>
          </button>

          <button
            className="tool-button"
            onClick={() => {
  if (selectedNodes.length > 1) {
    deleteSelectedNodes();
  } else {
    deleteNodeById(selectedNode);
  }
}}
            title="删除节点"
          >
            <span>⌫</span>
            <small>删除</small>
          </button>

          <div className="toolbar-divider" />

<button
  className="tool-button"
  onClick={undo}
  title="撤销 Ctrl+Z"
>
  <span>↶</span>
  <small>撤销</small>
</button>

<button
  className="tool-button"
  onClick={redo}
  title="重做 Ctrl+Shift+Z"
>
  <span>↷</span>
  <small>重做</small>
</button>

<button
  className="tool-button"
  onClick={autoArrange}
  title="自动排列"
>
  <span>↗</span>
  <small>排列</small>
</button>
          <button
  className="tool-button"
  onClick={() => {
    if (!selectedNode) {
      alert("请先选择一个节点");
      return;
    }

    setImageTargetNode(selectedNode);
    fileInputRef.current?.click();
  }}
  title="给节点添加图片"
>
  <span>□</span>
  <small>图片</small>
</button>
        </aside>

        <main className="canvas">
          {shareOpen && (
  <div className="share-overlay">
    <div
      className="share-modal"
      onClick={(event) =>
        event.stopPropagation()
      }
    >
      <div className="share-header">
        <h2>分享思维导图</h2>

        <button
          onClick={() => setShareOpen(false)}
        >
          ×
        </button>
      </div>

      <div className="share-form">
        <input
          type="email"
          placeholder="输入对方注册邮箱"
          value={shareEmail}
          onChange={(e) =>
            setShareEmail(e.target.value)
          }
        />

        <select
          value={shareRole}
          onChange={(e) =>
            setShareRole(e.target.value)
          }
        >
          <option value="viewer">
            只能查看
          </option>

          <option value="editor">
            可以编辑
          </option>
        </select>

        <button
          className="share-submit"
          onClick={addShare}
          disabled={shareLoading}
        >
          {shareLoading ? "分享中..." : "分享"}
        </button>
      </div>

      <div className="share-list">
        {shares.map((share) => (
          <div
            className="share-item"
            key={share.id}
          >
            <div>
              <div>{share.shared_with_email}</div>
              <small>
                {share.role === "editor"
                  ? "可编辑"
                  : "只读"}
              </small>
            </div>

            <button
              onClick={() =>
                removeShare(share.id)
              }
            >
              移除
            </button>
          </div>
        ))}

        {shares.length === 0 && (
          <div className="share-empty">
            暂时没有共享给任何人
          </div>
        )}
      </div>
    </div>
  </div>
)}
          <input
  ref={fileInputRef}
  type="file"
  accept="image/*"
  style={{ display: "none" }}
  onChange={async (event) => {
    const file = event.target.files?.[0];

    if (file && imageTargetNode) {
      await uploadImage(
        imageTargetNode,
        file
      );
    }

    event.target.value = "";
  }}
/>
          <ReactFlow
          
          selectionKeyCode="Control"
multiSelectionKeyCode="Control"
selectionMode="partial"
nodesDraggable={canEdit}
nodesConnectable={canEdit}
            nodes={nodes.map((node) => {
  if (editingNode !== node.id) {
    return node;
  }

  return {
    ...node,
    data: {
      ...node.data,
      label: (
        <input
          className="node-edit-input"
          autoFocus
          value={editingValue}
          onChange={(event) =>
            setEditingValue(event.target.value)
          }
          onBlur={finishEditing}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              finishEditing();
            }

            if (event.key === "Escape") {
              event.preventDefault();
              setEditingNode(null);
              setEditingValue("");
            }
          }}
        />
      ),
    },
  };
})}
edges={edges}
onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => {
  setSelectedNode(node.id);
  setSelectedNodes([node.id]);
  setContextMenu(null);
}}
            onNodeDoubleClick={(_, node) => {
              startEditing(
                node.id,
                node.data.label
              );
            }}
            onNodeContextMenu={handleNodeContextMenu}
           onSelectionChange={({ nodes }) => {
  const ids = nodes.map((node) => node.id);

  setSelectedNodes((current) => {
    if (
      current.length === ids.length &&
      current.every((id, index) => id === ids[index])
    ) {
      return current;
    }

    return ids;
  });
}}
            onPaneClick={() => {
  setSelectedNode(null);
  setSelectedNodes([]);
  setContextMenu(null);
}}
            fitView
            minZoom={0.2}
            maxZoom={2}
            attributionPosition="bottom-left"
          >
            <Background gap={24} size={1} />
            <Controls />
            <MiniMap />
          </ReactFlow>

          {contextMenu && (
            <div
              className="node-context-menu"
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
              }}
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <button
                onClick={() => {
                  const node = nodes.find(
                    (item) =>
                      item.id ===
                      contextMenu.nodeId
                  );

                  if (node) {
                    startEditing(
                      node.id,
                      node.data.label
                    );
                  }

                  setContextMenu(null);
                }}
              >
                ✎ 编辑文字
              </button>

              <button
                onClick={() =>
                  createChildNode(
                    contextMenu.nodeId
                  )
                }
              >
                ＋ 添加子节点
              </button>

              <button
                onClick={() =>
                  createSiblingNode(
                    contextMenu.nodeId
                  )
                }
              >
                ↳ 添加同级节点
              </button>

              <button
                onClick={() =>
                  changeEmoji(
                    contextMenu.nodeId
                  )
                }
              >
                😊 修改 Emoji
              </button>

              <button
                onClick={() =>
                  changeColor(
                    contextMenu.nodeId
                  )
                }
              >
                🎨 修改颜色
              </button>

              <div className="context-divider" />

              <button
                className="danger"
                onClick={() =>
                  deleteNodeById(
                    contextMenu.nodeId
                  )
                }
              >
                ⌫ 删除节点
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [currentMap, setCurrentMap] = useState(null);

  useEffect(() => {
    const getSession = async () => {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.error("获取登录状态失败：", error);
    }

    setSession(session);
  } catch (error) {
    console.error("Supabase 连接失败：", error);
    setSession(null);
  }
};

    getSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);

        if (!session) {
          setCurrentMap(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return (
      <div className="loading-screen">
        正在加载...
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (currentMap) {
    return (
      <MindMapEditor
        session={session}
        mindmap={currentMap}
        onBack={() => setCurrentMap(null)}
      />
    );
  }

  return (
    <Dashboard
      session={session}
      onOpenMap={(map) => setCurrentMap(map)}
    />
  );
}