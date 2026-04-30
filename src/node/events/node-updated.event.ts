export interface NodeStatusChange {
  nodeId: string;
  status: string;
}

export class NodeUpdatedEvent {
  constructor(
    public readonly projectId: string,
    /** 本次变更的节点列表，sync 全量同步时为空 */
    public readonly changes: NodeStatusChange[] = [],
  ) {}
}
