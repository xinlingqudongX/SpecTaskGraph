/** TB 方向自动布局工具 */

const NODE_W = 200;
const NODE_H = 60;
const H_GAP = 60;
const V_GAP = 100;

export interface LayoutNode {
  nodeId: string;
  parentNodeId?: string | null;
}

export interface Position {
  x: number;
  y: number;
}

/**
 * 对节点列表进行 Top-to-Bottom 分层布局。
 *
 * 算法：
 * 1. 构建父子关系，BFS 分配层深
 * 2. 递归计算每个子树的宽度
 * 3. 以子树宽度为基准，将父节点居中于子节点之上
 * 4. 多根节点并排排列
 *
 * @returns 每个 nodeId 对应的 {x, y} 坐标（左上角）
 */
export function computeTbLayout(nodes: LayoutNode[]): Map<string, Position> {
  if (nodes.length === 0) return new Map();

  const nodeIds = new Set(nodes.map((n) => n.nodeId));
  const childrenOf = new Map<string, string[]>();
  const depthOf = new Map<string, number>();

  for (const n of nodes) {
    childrenOf.set(n.nodeId, []);
  }
  for (const n of nodes) {
    const pid = n.parentNodeId;
    if (pid && nodeIds.has(pid)) {
      childrenOf.get(pid)!.push(n.nodeId);
    }
  }

  // BFS 分配层深
  const roots = nodes
    .filter((n) => !n.parentNodeId || !nodeIds.has(n.parentNodeId))
    .map((n) => n.nodeId);

  const queue = [...roots];
  for (const r of roots) depthOf.set(r, 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const child of childrenOf.get(id)!) {
      if (!depthOf.has(child)) {
        depthOf.set(child, depthOf.get(id)! + 1);
        queue.push(child);
      }
    }
  }

  // 没有被 BFS 覆盖的孤立节点（存在孤儿引用）单独放最后一层
  const maxDepth = Math.max(0, ...depthOf.values());
  for (const n of nodes) {
    if (!depthOf.has(n.nodeId)) depthOf.set(n.nodeId, maxDepth + 1);
  }

  // 递归计算子树宽度
  const subtreeWidthOf = new Map<string, number>();

  function subtreeWidth(nodeId: string): number {
    if (subtreeWidthOf.has(nodeId)) return subtreeWidthOf.get(nodeId)!;
    const children = childrenOf.get(nodeId) ?? [];
    let w: number;
    if (children.length === 0) {
      w = NODE_W;
    } else {
      w = children.reduce((sum, c, i) => sum + subtreeWidth(c) + (i > 0 ? H_GAP : 0), 0);
      w = Math.max(NODE_W, w);
    }
    subtreeWidthOf.set(nodeId, w);
    return w;
  }
  for (const r of roots) subtreeWidth(r);

  // 递归分配坐标（centerX 为子树中心 x）
  const pos = new Map<string, Position>();

  function assignPos(nodeId: string, centerX: number): void {
    const depth = depthOf.get(nodeId) ?? 0;
    pos.set(nodeId, {
      x: Math.round(centerX - NODE_W / 2),
      y: depth * (NODE_H + V_GAP),
    });

    const children = childrenOf.get(nodeId) ?? [];
    if (children.length === 0) return;

    const totalW = children.reduce(
      (sum, c, i) => sum + subtreeWidth(c) + (i > 0 ? H_GAP : 0),
      0,
    );
    let curX = centerX - totalW / 2;
    for (const child of children) {
      const w = subtreeWidth(child);
      assignPos(child, curX + w / 2);
      curX += w + H_GAP;
    }
  }

  // 多根节点并排
  const totalRootW = roots.reduce(
    (sum, r, i) => sum + subtreeWidth(r) + (i > 0 ? H_GAP : 0),
    0,
  );
  let curX = -totalRootW / 2;
  for (const root of roots) {
    const w = subtreeWidth(root);
    assignPos(root, curX + w / 2);
    curX += w + H_GAP;
  }

  return pos;
}
