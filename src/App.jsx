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

  /*
    距离参数

    DEPTH_GAP：
    父节点到子节点的距离

    SIBLING_GAP：
    同级节点之间的距离
  */

  const DEPTH_GAP = 260;
  const SIBLING_GAP = 95;

  /*
    返回某个子树在“横向/纵向宽度”上
    大概需要占多少个单位。

    和之前不同：
    不再把所有叶子数量直接加起来。

    我们只关心每一层最多有多少节点，
    这样链很长的时候不会把整张图撑爆。
  */

  const profileMemo = new Map();

  const getProfile = (nodeId) => {
    if (profileMemo.has(nodeId)) {
      return profileMemo.get(nodeId);
    }

    const profile = [1];

    const children = (
      childrenMap[nodeId] || []
    ).filter((childId) =>
      selectedSet.has(childId)
    );

    children.forEach((childId) => {
      const childProfile =
        getProfile(childId);

      childProfile.forEach(
        (count, depth) => {
          const targetDepth =
            depth + 1;

          profile[targetDepth] =
            (profile[targetDepth] || 0) +
            count;
        }
      );
    });

    profileMemo.set(nodeId, profile);

    return profile;
  };

  const getBreadth = (nodeId) => {
    const profile = getProfile(nodeId);

    return Math.max(...profile, 1);
  };

  /*
    得到当前节点选中的直接子节点
  */

  const getSelectedChildren = (nodeId) =>
    (childrenMap[nodeId] || []).filter(
      (childId) =>
        selectedSet.has(childId)
    );

  /*
    把一个分支沿指定方向展开。

    direction = 主分支前进方向

    例如：

    右边：
    direction = 0

    上边：
    direction = -90°

    下边：
    direction = 90°

    左边：
    direction = 180°
  */

  const placeChildren = (
    parentPosition,
    direction,
    children
  ) => {
    if (!children.length) {
      return;
    }

    /*
      与主方向垂直的方向。

      右 → 上下分开
      上 → 左右分开
      左 → 上下分开
      下 → 左右分开
    */

    const perpendicular = {
      x: -Math.sin(direction),
      y: Math.cos(direction),
    };

    /*
      保留用户原本的兄弟节点顺序。
    */

    const orderedChildren = [
      ...children,
    ].sort((a, b) => {
      const nodeA = nodeMap[a];
      const nodeB = nodeMap[b];

      const offsetA =
        (nodeA.position.x -
          parentPosition.x) *
          perpendicular.x +
        (nodeA.position.y -
          parentPosition.y) *
          perpendicular.y;

      const offsetB =
        (nodeB.position.x -
          parentPosition.x) *
          perpendicular.x +
        (nodeB.position.y -
          parentPosition.y) *
          perpendicular.y;

      return offsetA - offsetB;
    });

    /*
      计算每个子树需要占用的空间。

      这里只取“这一整棵子树某一层最大宽度”，
      不再把所有叶子无限累加。
    */

    const widths = orderedChildren.map(
      (childId) =>
        Math.max(
          getBreadth(childId),
          1
        )
    );

    const totalWidth =
      widths.reduce(
        (sum, value) =>
          sum + value,
        0
      );

    let cursor =
      -((totalWidth - 1) *
        SIBLING_GAP) /
      2;

    orderedChildren.forEach(
      (childId, index) => {
        const width =
          widths[index];

        /*
          当前子树自己的中心位置。
        */

        const localOffset =
          cursor +
          ((width - 1) *
            SIBLING_GAP) /
            2;

        const childPosition = {
          x:
            parentPosition.x +
            Math.cos(direction) *
              DEPTH_GAP +
            perpendicular.x *
              localOffset,

          y:
            parentPosition.y +
            Math.sin(direction) *
              DEPTH_GAP +
            perpendicular.y *
              localOffset,
        };

        newPositions[childId] =
          childPosition;

        /*
          子节点继续沿完全相同的方向展开。
        */

        const grandchildren =
          getSelectedChildren(
            childId
          );

        placeChildren(
          childPosition,
          direction,
          grandchildren
        );

        cursor +=
          width *
          SIBLING_GAP;
      }
    );
  };

  /*
    判断是否是“全图排列”。

    root 不需要选中，
    它永远是固定中心。
  */

  const wholeMapSelected =
    nodes.every(
      (node) =>
        node.id === "root" ||
        selectedSet.has(node.id)
    );

  /*
    =====================================
    情况 1：整个导图排列
    =====================================
  */

  if (wholeMapSelected) {
    const rootChildren =
      childrenMap[root.id] || [];

    if (
      rootChildren.length === 0
    ) {
      return newPositions;
    }

    /*
      一级节点严格均分 360°。

      2 → 180°
      3 → 120°
      4 → 90°
      5 → 72°
      ...

      0° 从右侧开始。
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
            Math.cos(direction) *
              DEPTH_GAP,

          y:
            root.position.y +
            Math.sin(direction) *
              DEPTH_GAP,
        };

        newPositions[childId] =
          childPosition;

        /*
          这一整条分支都沿自己的
          一级节点方向继续展开。
        */

        const grandchildren =
          getSelectedChildren(
            childId
          );

        placeChildren(
          childPosition,
          direction,
          grandchildren
        );
      }
    );

    /*
      中心节点绝对不移动。
    */

    newPositions[root.id] = {
      x: root.position.x,
      y: root.position.y,
    };

    return newPositions;
  }

  /*
    =====================================
    情况 2：局部排列
    =====================================

    例如：

          C
          |
    A ——— B ——— D

    只选 C / D

    B 作为锚点，
    B 完全不动。
  */

  const topSelectedNodes =
    nodes.filter((node) => {
      if (
        node.id === "root" ||
        !selectedSet.has(node.id)
      ) {
        return false;
      }

      const parentEdge =
        edges.find(
          (edge) =>
            edge.target === node.id
        );

      if (!parentEdge) {
        return false;
      }

      const parentId =
        parentEdge.source;

      /*
        如果父节点没选中，
        当前节点就是这个局部区域的根。
      */

      return !selectedSet.has(
        parentId
      );
    });

  /*
    按锚点分组。
  */

  const anchorGroups = {};

  topSelectedNodes.forEach(
    (node) => {
      const parentEdge =
        edges.find(
          (edge) =>
            edge.target === node.id
        );

      if (!parentEdge) {
        return;
      }

      const anchorId =
        parentEdge.source;

      if (!anchorGroups[anchorId]) {
        anchorGroups[anchorId] =
          [];
      }

      anchorGroups[anchorId].push(
        node.id
      );
    }
  );

  Object.entries(
    anchorGroups
  ).forEach(
    ([anchorId, childIds]) => {
      const anchor =
        nodeMap[anchorId];

      if (!anchor) {
        return;
      }

      /*
        root 下只选择了一部分节点时，
        保留它们原来的方向。

        例如：
        一个在右边，
        一个在上边，

        不会被平均成右上角。
      */

      if (
        anchorId === root.id &&
        childIds.length > 1
      ) {
        childIds.forEach(
          (childId) => {
            const node =
              nodeMap[childId];

            let dx =
              node.position.x -
              anchor.position.x;

            let dy =
              node.position.y -
              anchor.position.y;

            if (
              Math.abs(dx) <
                0.001 &&
              Math.abs(dy) <
                0.001
            ) {
              dx = 1;
              dy = 0;
            }

            const direction =
              Math.atan2(
                dy,
                dx
              );

            const childPosition = {
              x:
                anchor.position.x +
                Math.cos(
                  direction
                ) *
                  DEPTH_GAP,

              y:
                anchor.position.y +
                Math.sin(
                  direction
                ) *
                  DEPTH_GAP,
            };

            newPositions[
              childId
            ] = childPosition;

            const grandchildren =
              getSelectedChildren(
                childId
              );

            placeChildren(
              childPosition,
              direction,
              grandchildren
            );
          }
        );

        return;
      }

      /*
        一般情况：
        根据原来的位置判断这个分支
        朝哪个方向展开。
      */

      let dx = 0;
      let dy = 0;

      childIds.forEach(
        (childId) => {
          const node =
            nodeMap[childId];

          dx +=
            node.position.x -
            anchor.position.x;

          dy +=
            node.position.y -
            anchor.position.y;
        }
      );

      if (
        Math.abs(dx) <
          0.001 &&
        Math.abs(dy) <
          0.001
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

      const direction =
        Math.atan2(dy, dx);

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
    root 永远不动。
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
      message:
        "请先选择要排列的节点。可以使用 Ctrl + A 全选。",
    });
    return;
  }

  const newPositions =
    arrangeMindMap(
      nodes,
      edges,
      selectedNodes
    );

  if (
    Object.keys(newPositions)
      .length === 0
  ) {
    return;
  }

  setIsArranging(true);

  setNodes((nds) =>
    nds.map((node) => {
      const position =
        newPositions[node.id];

      if (!position) {
        return node;
      }

      return {
        ...node,
        position,
        className:
          "mind-node-arranging",
      };
    })
  );

  /*
    排列后的线直接使用直线。
    对于上下左右的径向结构，
    会比 smoothstep 干净很多。
  */

  setEdges((eds) =>
    eds.map((edge) => ({
      ...edge,
      type: "straight",
    }))
  );

  clearTimeout(
    arrangeTimerRef.current
  );

  arrangeTimerRef.current =
    setTimeout(() => {
      setIsArranging(false);

      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          className: "",
        }))
      );
    }, 450);
};

  const onConnect = useCallback(
  (params) => {
    if (!canEdit) return;

    setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "straight",
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
