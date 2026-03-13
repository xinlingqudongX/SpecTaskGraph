import { WorkflowController } from './workflow.controller';
import { WorkflowExportService } from './workflow-export.service';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeNodeService() {
  return {
    sync: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeWorkflowExportService() {
  return {
    exportWorkflow: jest.fn().mockResolvedValue({
      projectId: 'proj-1',
      projectName: 'Test Project',
      exported_at: new Date().toISOString(),
      total_nodes: 0,
      nodes: [],
      execution_order: [],
      executable_now: [],
    }),
  } as any;
}

// ---------------------------------------------------------------------------
// WorkflowController
// ---------------------------------------------------------------------------

describe('WorkflowController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET :projectId/export delegates to workflowExportService.exportWorkflow(projectId)', async () => {
    const nodeService = makeNodeService();
    const workflowExportService = makeWorkflowExportService();

    // WorkflowController currently takes only NodeService.
    // After Wave 2 adds WorkflowExportService injection, constructor becomes two-argument.
    // Writing the test expecting the two-argument constructor — RED now, GREEN after Wave 2.
    const controller = new WorkflowController(nodeService, workflowExportService);

    const result = await controller.export('proj-1');

    expect(workflowExportService.exportWorkflow).toHaveBeenCalledTimes(1);
    expect(workflowExportService.exportWorkflow).toHaveBeenCalledWith('proj-1');
    expect(result).toEqual(
      expect.objectContaining({
        projectId: 'proj-1',
        nodes: [],
      }),
    );
  });
});
