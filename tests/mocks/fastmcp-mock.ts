import { vi } from 'vitest';

/**
 * Mock FastMCP server for testing MCP tools
 */

export interface MockTool {
  name: string;
  description: string;
  parameters: any;
  execute: (request: any) => Promise<any>;
}

export class MockFastMCP {
  private tools: Map<string, MockTool> = new Map();
  private resources: Map<string, any> = new Map();
  
  addTool(tool: MockTool) {
    this.tools.set(tool.name, tool);
  }
  
  addResource(resource: any) {
    this.resources.set(resource.uri, resource);
  }
  
  // Test helpers
  getTool(name: string): MockTool | undefined {
    return this.tools.get(name);
  }
  
  getAllTools(): MockTool[] {
    return Array.from(this.tools.values());
  }
  
  getResource(uri: string): any {
    return this.resources.get(uri);
  }
  
  getAllResources(): any[] {
    return Array.from(this.resources.values());
  }
  
  async executeTool(name: string, request: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool ${name} not found`);
    }
    
    return await tool.execute(request);
  }
  
  clearTools() {
    this.tools.clear();
  }
  
  clearResources() {
    this.resources.clear();
  }
  
  clear() {
    this.clearTools();
    this.clearResources();
  }
}

export function createMockFastMCP(): MockFastMCP {
  return new MockFastMCP();
}