import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import MindMapThumbnail from "./components/MindMapThumbnail";
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
const COLOR_PRESETS = [
  "#F4CCCC",
  "#FCE5CD",
  "#FFF2CC",
  "#D9EAD3",
  "#D0E0E3",
  "#CFE2F3",
  "#D9D2E9",
  "#E6E6E6",
];

function hexToHsv(hex) {
  let value = (hex || "#ffffff").replace("#", "").trim();

  if (value.length === 3) {
    value = value
      .split("")
      .map((char) => char + char)
      .join("");
  }

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    value = "ffffff";
  }

  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }

  if (h < 0) {
    h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return {
    h,
    s,
    v,
  };
}

function hsvToHex(h, s, v) {
  const c = v * s;
  const x =
    c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (number) =>
    Math.round((number + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function arrangeMindMap(nodes, edges, selectedIds) {
  const selectedSet = new Set(selectedIds);

  if (!nodes.length || selectedSet.size === 0) {
    return {};
  }

  const root = nodes.find(
    (node) => node.id === "root"
  );

  if (!root) {
    return {};
  }

  const nodeMap = Object.fromEntries(
    nodes.map((node) => [node.id, node])
  );

  const childrenMap = {};

  nodes.forEach((node) => {
    childrenMap[node.id] = [];
  });

  edges.forEach((edge) => {
    if (childrenMap[edge.source]) {
      childrenMap[edge.source].push(edge.target);
    }
  });

  const newPositions = {
    [root.id]: {
      x: root.position.x,
      y: root.position.y,
    },
  };

  const GAP = 300;
  const SIBLING_GAP = 135;

  /*
    计算一个选中子树需要占用多少个“叶子位置”
  */
  const leafMemo = new Map();

  const selectedChildren = (nodeId) => {
    return (childrenMap[nodeId] || []).filter(
      (childId) => selectedSet.has(childId)
    );
  };

  const leafCount = (nodeId) => {
    if (leafMemo.has(nodeId)) {
      return leafMemo.get(nodeId);
    }

    const children = selectedChildren(nodeId);

    if (children.length === 0) {
      const result = selectedSet.has(nodeId) ? 1 : 0;
      leafMemo.set(nodeId, result);
      return result;
    }

    const result = children.reduce(
      (sum, childId) =>
        sum + Math.max(leafCount(childId), 1),
      0
    );

    leafMemo.set(nodeId, result);

    return result;
  };

  /*
    沿某一个方向，把一个节点的子节点规则展开。

    direction：
    这个分支整体向哪个方向走。

    parentPosition：
    当前父节点的位置。

    children：
    当前需要移动的选中子节点。
  */
  const placeChildren = (
    parentPosition,
    direction,
    children
  ) => {
    if (!children.length) {
      return;
    }

    const perp = {
      x: -Math.sin(direction),
      y: Math.cos(direction),
    };

    /*
      根据原来的相对位置排序，
      避免整理后兄弟节点顺序突然颠倒。
    */
    const orderedChildren = [...children].sort(
      (a, b) => {
        const nodeA = nodeMap[a];
        const nodeB = nodeMap[b];

        const offsetA =
          (nodeA.position.x - parentPosition.x) *
            perp.x +
          (nodeA.position.y - parentPosition.y) *
            perp.y;

        const offsetB =
          (nodeB.position.x - parentPosition.x) *
            perp.x +
          (nodeB.position.y - parentPosition.y) *
            perp.y;

        return offsetA - offsetB;
      }
    );

    const spans = orderedChildren.map(
      (childId) =>
        Math.max(leafCount(childId), 1)
    );

    const totalSpan = spans.reduce(
      (sum, span) => sum + span,
      0
    );

    let cursor =
      -((totalSpan - 1) * SIBLING_GAP) / 2;

    orderedChildren.forEach(
      (childId, index) => {
        const span = spans[index];

        /*
          当前子树占用一段空间，
          取这一段的中心作为子节点位置。
        */
        const offset =
          cursor +
          ((span - 1) * SIBLING_GAP) / 2;

        const childPosition = {
          x:
            parentPosition.x +
            Math.cos(direction) * GAP +
            perp.x * offset,

          y:
            parentPosition.y +
            Math.sin(direction) * GAP +
            perp.y * offset,
        };

        newPositions[childId] =
          childPosition;

        const grandchildren =
          selectedChildren(childId);

        placeChildren(
          childPosition,
          direction,
          grandchildren
        );

        cursor +=
          span * SIBLING_GAP;
      }
    );
  };

  /*
    判断是不是“整个导图都参与排列”。

    root 即使没选中，也认为整张导图被选中了，
    因为 root 永远只是中心锚点，不移动。
  */
  const wholeMapSelected = nodes.every(
    (node) =>
      node.id === "root" ||
      selectedSet.has(node.id)
  );

  /*
    ============================
    情况一：整个导图排列
    ============================
  */

  if (wholeMapSelected) {
    const rootChildren =
      childrenMap[root.id] || [];

    if (rootChildren.length === 0) {
      return newPositions;
    }

    /*
      第一层节点均分 360°。

      2 个：180°
      3 个：120°
      4 个：90°
      5 个：72°
      ...
    */
    const angleStep =
      (Math.PI * 2) /
      rootChildren.length;

    rootChildren.forEach(
      (childId, index) => {
        const direction =
          index * angleStep;

        const childPosition = {
          x:
            root.position.x +
            Math.cos(direction) * GAP,

          y:
            root.position.y +
            Math.sin(direction) * GAP,
        };

        newPositions[childId] =
          childPosition;

        const grandchildren =
          selectedChildren(childId);

        placeChildren(
          childPosition,
          direction,
          grandchildren
        );
      }
    );

    /*
      中心节点永远不移动。
    */
    newPositions[root.id] = {
      x: root.position.x,
      y: root.position.y,
    };

    return newPositions;
  }

  /*
    ============================
    情况二：只排列选中的部分
    ============================

    找到每个“选中区域”的最顶层节点。

    例如：

    A
    ├── B
    │   └── C
    └── D

    只选 B + C：

    A 不动
    B 移动
    C 跟着 B 移动

    A 就是锚点。
  */

  const rootsToArrange = nodes.filter(
    (node) => {
      if (
        node.id === "root" ||
        !selectedSet.has(node.id)
      ) {
        return false;
      }

      const parentEdge = edges.find(
        (edge) => edge.target === node.id
      );

      /*
        没有父节点的孤立节点，
        不参与局部整理。
      */
      if (!parentEdge) {
        return false;
      }

      const parentId = parentEdge.source;

      /*
        父节点没有选中，
        或者父节点就是 root。

        root 永远视为固定锚点，
        即使 Ctrl+A 时 root 自己也被选中。
      */
      return (
        !selectedSet.has(parentId) ||
        parentId === root.id
      );
    }
  );

  const groups = {};

  rootsToArrange.forEach((node) => {
    const parentEdge = edges.find(
      (edge) => edge.target === node.id
    );

    if (!parentEdge) {
      return;
    }

    const anchorId =
      parentEdge.source;

    if (!groups[anchorId]) {
      groups[anchorId] = [];
    }

    groups[anchorId].push(node.id);
  });

  Object.entries(groups).forEach(
    ([anchorId, childIds]) => {
      const anchor =
        nodeMap[anchorId];

      if (!anchor) {
        return;
      }

      /*
        根据当前节点相对于锚点的位置，
        找出这个分支原本的大致方向。
      */

      let dx = 0;
      let dy = 0;

      childIds.forEach((childId) => {
        const node =
          nodeMap[childId];

        dx +=
          node.position.x -
          anchor.position.x;

        dy +=
          node.position.y -
          anchor.position.y;
      });

      /*
        如果刚好互相抵消，
        就使用第一个节点原来的方向。
      */
      if (
        Math.abs(dx) < 0.001 &&
        Math.abs(dy) < 0.001
      ) {
        const firstNode =
          nodeMap[childIds[0]];

        dx =
          firstNode.position.x -
          anchor.position.x;

        dy =
          firstNode.position.y -
          anchor.position.y;
      }

      let direction = Math.atan2(
        dy,
        dx
      );

      /*
        如果真的完全没有方向，
        默认向右。
      */
      if (
        Math.abs(dx) < 0.001 &&
        Math.abs(dy) < 0.001
      ) {
        direction = 0;
      }

      placeChildren(
        {
          x: anchor.position.x,
          y: anchor.position.y,
        },
        direction,
        childIds
      );
    }
  );

  /*
    root 永远保持原位。
  */
  newPositions[root.id] = {
    x: root.position.x,
    y: root.position.y,
  };

  return newPositions;
}
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
  const [dialog, setDialog] = useState(null);
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
  "id, title, is_favorite, created_at, updated_at, user_id, nodes, edges"
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
     setDialog({
  type: "message",
  title: "创建失败",
  message: error.message,
});
    } else if (data) {
      onOpenMap(data);
    }

    setCreating(false);
  };

 const deleteMindMap = async (id) => {
  setDialog({
    type: "confirm",
    title: "删除思维导图",
    message: "确定要删除这个思维导图吗？删除后无法恢复。",
    onConfirm: async () => {
      setDialog(null);

      const { error } = await supabase
        .from("mindmaps")
        .delete()
        .eq("id", id)
        .eq("user_id", session.user.id);

      if (error) {
        setDialog({
          type: "message",
          title: "删除失败",
          message: error.message,
        });
        return;
      }

      setMindmaps((maps) =>
        maps.filter((map) => map.id !== id)
      );
    },
  });
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
     setDialog({
  type: "message",
  title: "操作失败",
  message: error.message,
});
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
{dialog && (
  <div className="app-dialog-overlay">
    <div
      className="app-dialog"
      onClick={(event) =>
        event.stopPropagation()
      }
    >
      <div className="app-dialog-header">
        <h3>{dialog.title}</h3>

        <button
          onClick={() => setDialog(null)}
        >
          ×
        </button>
      </div>

      <div className="app-dialog-body">
        {dialog.type === "input" ? (
          <input
            className="app-dialog-input"
            autoFocus
            value={dialog.value || ""}
            placeholder={dialog.placeholder || ""}
            onChange={(event) =>
              setDialog((current) => ({
                ...current,
                value: event.target.value,
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();

                if (dialog.onConfirm) {
                  dialog.onConfirm(
                    dialog.value || ""
                  );
                }
              }

              if (event.key === "Escape") {
                setDialog(null);
              }
            }}
          />
        ) : (
          <div>{dialog.message}</div>
        )}
      </div>

      <div className="app-dialog-actions">
        {dialog.type === "confirm" && (
          <button
            className="app-dialog-cancel"
            onClick={() => setDialog(null)}
          >
            取消
          </button>
        )}

        <button
          className="app-dialog-confirm"
          onClick={() => {
            if (dialog.onConfirm) {
              dialog.onConfirm(
                dialog.value || ""
              );
            } else {
              setDialog(null);
            }
          }}
        >
          确定
        </button>
      </div>
    </div>
  </div>
)}
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
                <MindMapThumbnail
  nodes={map.nodes}
  edges={map.edges}
/>

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

const [dialog, setDialog] = useState(null);

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
    setDialog({
  type: "message",
  title: "无法分享",
  message: "请输入对方邮箱。",
});
    return;
  }

  if (email === session.user.email.toLowerCase()) {
    setDialog({
  type: "message",
  title: "无法分享",
  message: "不能分享给自己。",
});
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
    setDialog({
  type: "message",
  title: "分享失败",
  message: error.message,
});
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
    setDialog({
  type: "message",
  title: "取消分享失败",
  message: error.message,
});
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
const [isArranging, setIsArranging] = useState(false);

const arrangeTimerRef = useRef(null);

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

console.log("自动保存触发", {
  loading,
  canEdit,
  mindmapId: mindmap.id,
});

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

    const { data, error } = await supabase
      .from("mindmaps")
      .update({
        nodes: nodesToSave,
        edges,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mindmap.id)
      .select("id")
      .single();

    if (error) {
      console.error("保存失败:", error);
    } else {
      console.log("保存成功:", data);
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

  if (selectedNodes.length === 0) {
    setDialog({
      type: "message",
      title: "无法排列",
      message: "请先选择要排列的节点。可以使用 Ctrl + A 全选。",
    });
    return;
  }

  const newPositions = arrangeMindMap(
    nodes,
    edges,
    selectedNodes
  );

  if (
    !newPositions ||
    Object.keys(newPositions).length === 0
  ) {
    return;
  }

  setIsArranging(true);

  setNodes((nds) =>
    nds.map((node) => {
      const nextPosition =
        newPositions[node.id];

      if (!nextPosition) {
        return node;
      }

      return {
        ...node,
        position: nextPosition,
      };
    })
  );

  clearTimeout(arrangeTimerRef.current);

  arrangeTimerRef.current = setTimeout(() => {
    setIsArranging(false);
  }, 450);
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
  if (!canEdit) return;

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
   setDialog({
  type: "message",
  title: "无法删除",
  message: "中心节点不能删除。",
});
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
   setDialog({
  type: "message",
  title: "无法删除",
  message: "中心节点不能删除。",
});
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

  setDialog({
    type: "input",
    title: "修改 Emoji",
    value: node.data.emoji || "",
    placeholder: "输入 Emoji",
    onConfirm: (emoji) => {
      setDialog(null);

      if (!emoji.trim()) return;

      setNodes((nds) =>
        nds.map((item) =>
          item.id === nodeId
            ? {
                ...item,
                data: {
                  ...item.data,
                  emoji: emoji.trim(),
                },
              }
            : item
        )
      );

      setContextMenu(null);
    },
  });
};

const changeColor = (nodeId) => {
  if (!canEdit) return;

  const node = nodes.find(
    (item) => item.id === nodeId
  );

  if (!node) return;

  const currentColor =
    node.data.color || "#ffffff";

  const { h, s, v } =
    hexToHsv(currentColor);

  setDialog({
    type: "color",
    title: "修改节点颜色",
    value: currentColor,
    hue: h,
    saturation: s,
    brightness: v,

    onConfirm: (color) => {
      setDialog(null);

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
    },
  });
};
const updateColorSquare = (event) => {
  const rect =
    event.currentTarget.getBoundingClientRect();

  const x =
    (event.clientX - rect.left) /
    rect.width;

  const y =
    (event.clientY - rect.top) /
    rect.height;

  const saturation = Math.max(
    0,
    Math.min(1, x)
  );

  const brightness = Math.max(
    0,
    Math.min(1, 1 - y)
  );

  setDialog((current) => {
    if (!current) return current;

    const color = hsvToHex(
      current.hue || 0,
      saturation,
      brightness
    );

    return {
      ...current,
      saturation,
      brightness,
      value: color,
    };
  });
};

const updateHueSlider = (event) => {
  const rect =
    event.currentTarget.getBoundingClientRect();

  const x =
    (event.clientX - rect.left) /
    rect.width;

  const hue = Math.max(
    0,
    Math.min(1, x)
  ) * 360;

  setDialog((current) => {
    if (!current) return current;

    const color = hsvToHex(
      hue,
      current.saturation || 0,
      current.brightness ?? 1
    );

    return {
      ...current,
      hue,
      value: color,
    };
  });
};
const uploadImage = async (nodeId, file) => {
  if (!canEdit) return;
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    setDialog({
  type: "message",
  title: "无法添加图片",
  message: "请选择图片文件。",
});
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
  setDialog({
  type: "message",
  title: "图片过大",
  message: "图片不能超过 5MB。",
});
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

    setDialog({
  type: "message",
  title: "图片上传失败",
  message: error.message || "未知错误",
});
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

 if (
  event.ctrlKey &&
  event.key.toLowerCase() === "a"
) {
  if (!canEdit) {
    return;
  }

  event.preventDefault();

  const allIds = nodes.map(
    (node) => node.id
  );

  setSelectedNodes(allIds);
  setSelectedNode(null);

  setNodes((nds) =>
    nds.map((node) => ({
      ...node,
      selected: true,
    }))
  );

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
  setSelectedNodes([node.id]);

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

  setDialog({
    type: "input",
    title: "重命名思维导图",
    value: mindmap.title,
    placeholder: "请输入思维导图名称",
    onConfirm: async (newTitle) => {
      if (!newTitle || !newTitle.trim()) {
        setDialog(null);
        return;
      }

      setDialog(null);

      const { error } = await supabase
        .from("mindmaps")
        .update({
          title: newTitle.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", mindmap.id)
        .eq("user_id", session.user.id);

      if (error) {
        setDialog({
          type: "message",
          title: "修改失败",
          message: error.message,
        });
        return;
      }

      mindmap.title = newTitle.trim();
    },
  });
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
  setDialog({
  type: "message",
  title: "无法添加节点",
  message: "请先选择一个节点。",
});
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
  disabled={isArranging}
  title="自动排列"
>
  <span>↗</span>
  <small>排列</small>
</button>
          <button
  className="tool-button"
  onClick={() => {
    if (!selectedNode) {
     setDialog({
  type: "message",
  title: "无法添加节点",
  message: "请先选择一个节点。",
});
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
    if (!isArranging) {
      return node;
    }

    return {
      ...node,
      className: "mind-node-arranging",
    };
  }

  return {
    ...node,
    className: isArranging
      ? "mind-node-arranging"
      : "",
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
  setContextMenu(null);
}}
            onNodeDoubleClick={(_, node) => {
              startEditing(
                node.id,
                node.data.label
              );
            }}
            onNodeContextMenu={handleNodeContextMenu}
           onSelectionChange={({ nodes: selectedReactNodes }) => {
  const ids = selectedReactNodes.map(
    (node) => node.id
  );

  setSelectedNodes((current) => {
    if (
      current.length === ids.length &&
      current.every(
        (id, index) => id === ids[index]
      )
    ) {
      return current;
    }

    return ids;
  });

  /*
    只有单选时才存在“当前节点”。
    多选时 selectedNode 清空，
    防止“编辑节点 / 添加节点”误操作某一个节点。
  */
  setSelectedNode(
    ids.length === 1 ? ids[0] : null
  );
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
        
{dialog && (
  <div className="app-dialog-overlay">
    <div
      className={`app-dialog ${
        dialog.type === "color"
          ? "app-dialog-color"
          : ""
      }`}
      onClick={(event) =>
        event.stopPropagation()
      }
    >
      <div className="app-dialog-header">
        <h3>{dialog.title}</h3>

        <button
          onClick={() => setDialog(null)}
        >
          ×
        </button>
      </div>

      <div className="app-dialog-body">
        {dialog.type === "color" ? (
          <div className="color-picker">
            <div
              className="color-picker-square"
              style={{
                backgroundColor: `hsl(${
                  dialog.hue || 0
                }, 100%, 50%)`,
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(
                  event.pointerId
                );
                updateColorSquare(event);
              }}
              onPointerMove={(event) => {
                if (
                  event.currentTarget.hasPointerCapture(
                    event.pointerId
                  )
                ) {
                  updateColorSquare(event);
                }
              }}
              onPointerUp={(event) => {
                if (
                  event.currentTarget.hasPointerCapture(
                    event.pointerId
                  )
                ) {
                  event.currentTarget.releasePointerCapture(
                    event.pointerId
                  );
                }
              }}
            >
              <div className="color-picker-white" />
              <div className="color-picker-black" />

              <div
                className="color-picker-handle"
                style={{
                  left: `${
                    (dialog.saturation || 0) *
                    100
                  }%`,
                  top: `${
                    (1 -
                      (dialog.brightness ??
                        1)) *
                    100
                  }%`,
                }}
              />
            </div>

            <div
              className="color-picker-hue"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(
                  event.pointerId
                );
                updateHueSlider(event);
              }}
              onPointerMove={(event) => {
                if (
                  event.currentTarget.hasPointerCapture(
                    event.pointerId
                  )
                ) {
                  updateHueSlider(event);
                }
              }}
              onPointerUp={(event) => {
                if (
                  event.currentTarget.hasPointerCapture(
                    event.pointerId
                  )
                ) {
                  event.currentTarget.releasePointerCapture(
                    event.pointerId
                  );
                }
              }}
            >
              <div
                className="color-picker-hue-handle"
                style={{
                  left: `${
                    ((dialog.hue || 0) /
                      360) *
                    100
                  }%`,
                }}
              />
            </div>

            <div className="color-picker-current">
              <div
                className="color-picker-preview"
                style={{
                  background:
                    dialog.value ||
                    "#ffffff",
                }}
              />

              <span>
                {(
                  dialog.value ||
                  "#ffffff"
                ).toUpperCase()}
              </span>
            </div>

            <div className="color-picker-label">
              快速颜色
            </div>

            <div className="color-picker-presets">
              {COLOR_PRESETS.map(
                (color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-preset ${
                      dialog.value?.toLowerCase() ===
                      color.toLowerCase()
                        ? "active"
                        : ""
                    }`}
                    style={{
                      backgroundColor:
                        color,
                    }}
                    onClick={() => {
                      const {
                        h,
                        s,
                        v,
                      } = hexToHsv(
                        color
                      );

                      setDialog(
                        (current) => ({
                          ...current,
                          value: color,
                          hue: h,
                          saturation:
                            s,
                          brightness:
                            v,
                        })
                      );
                    }}
                    title={color}
                  />
                )
              )}
            </div>
          </div>
        ) : dialog.type === "input" ? (
          <input
            className="app-dialog-input"
            autoFocus
            value={dialog.value || ""}
            placeholder={
              dialog.placeholder || ""
            }
            onChange={(event) =>
              setDialog((current) => ({
                ...current,
                value:
                  event.target.value,
              }))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();

                if (dialog.onConfirm) {
                  dialog.onConfirm(
                    dialog.value || ""
                  );
                }
              }

              if (
                event.key === "Escape"
              ) {
                setDialog(null);
              }
            }}
          />
        ) : (
          <div>{dialog.message}</div>
        )}
      </div>

      <div className="app-dialog-actions">
        {(dialog.type === "confirm" ||
          dialog.type === "input" ||
          dialog.type === "color") && (
          <button
            className="app-dialog-cancel"
            onClick={() =>
              setDialog(null)
            }
          >
            取消
          </button>
        )}

        <button
          className="app-dialog-confirm"
          onClick={() => {
            if (dialog.onConfirm) {
              dialog.onConfirm(
                dialog.value || ""
              );
            } else {
              setDialog(null);
            }
          }}
        >
          确定
        </button>
      </div>
    </div>
  </div>
)}
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
