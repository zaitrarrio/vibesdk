import { useState } from 'react';
import { PhaseTimeline } from './components/phase-timeline';
import { mockScenarios } from './mocks/phase-timeline-mock';
import { generateMockFilesForPhases, generateLongFileNameMockFiles } from './mocks/file-mock';
import type { PhaseTimelineItem, FileType } from './hooks/use-chat';

export function PhaseTimelinePreview() {
  const [selectedScenario, setSelectedScenario] = useState<string>('Sequential Phases');
  const [phaseTimeline, setPhaseTimeline] = useState<PhaseTimelineItem[]>(() => 
    mockScenarios['Sequential Phases']()
  );
  const [files, setFiles] = useState<FileType[]>(() => generateMockFilesForPhases());
  const [activeFile, setActiveFile] = useState<FileType | undefined>();

  const handleScenarioChange = (scenarioName: string) => {
    setSelectedScenario(scenarioName);
    const generator = mockScenarios[scenarioName as keyof typeof mockScenarios];
    const mockTimeline = generator();
    
    // Use appropriate mock files based on scenario
    let mockFiles: FileType[] = [];
    if (scenarioName === 'Empty Timeline') {
      mockFiles = [];
    } else if (scenarioName === 'Long File Names') {
      mockFiles = generateLongFileNameMockFiles(); // Use high line count files
    } else {
      mockFiles = generateMockFilesForPhases();
    }
    
    setPhaseTimeline(mockTimeline);
    setFiles(mockFiles);
    setActiveFile(undefined);
  };

  const handleFileClick = (file: FileType) => {
    setActiveFile(file);
  };

  return (
    <div className="min-h-screen bg-bg-3 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-bg-4 rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-text-primary mb-2">Phase Timeline Preview</h1>
          <p className="text-text-tertiary mb-6">
            Test different phase timeline scenarios without running full code generation.
          </p>

          {/* Scenario Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-text-primary mb-3">
              Test Scenario
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.keys(mockScenarios).map((scenarioName) => (
                <label key={scenarioName} className="flex items-center">
                  <input
                    type="radio"
                    name="scenario"
                    value={scenarioName}
                    checked={selectedScenario === scenarioName}
                    onChange={(e) => handleScenarioChange(e.target.value)}
                    className="mr-2 text-blue-600"
                  />
                  <span className="text-sm text-text-primary">{scenarioName}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Phase Timeline Panel */}
          <div className="lg:col-span-1">
            <div className="bg-bg-4 rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Generating code</h2>
              <PhaseTimeline
                phaseTimeline={phaseTimeline}
                files={files}
                view="editor"
                activeFile={activeFile}
                onFileClick={handleFileClick}
              />
            </div>
          </div>

          {/* File Details Panel */}
          <div className="lg:col-span-2">
            <div className="bg-bg-4 rounded-lg shadow-lg p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">
                {activeFile ? `File: ${activeFile.filePath}` : 'Select a file to view details'}
              </h2>
              
              {activeFile ? (
                <div className="space-y-4">
                  <div className="bg-bg-3 rounded-lg p-4">
                    <h3 className="font-medium text-text-primary mb-2">File Details</h3>
                    <p><span className="font-medium">Path:</span> {activeFile.filePath}</p>
                    <p><span className="font-medium">Status:</span> {activeFile.isGenerating ? 'Generating' : 'Completed'}</p>
                    <p><span className="font-medium">Lines:</span> {activeFile.fileContents.split('\n').length}</p>
                  </div>
                  
                  <div>
                    <h3 className="font-medium text-text-primary mb-2">File Contents Preview</h3>
                    <pre className="bg-zinc-900 dark:bg-zinc-950 text-zinc-100 p-4 rounded-lg overflow-auto text-sm max-h-96">
                      {activeFile.fileContents.slice(0, 1000)}
                      {activeFile.fileContents.length > 1000 && '\n\n... (truncated)'}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-text-tertiary">
                  <p>Click on a file in the phase timeline to view its details and contents.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Panel */}
        <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Timeline Stats</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{phaseTimeline.length}</div>
              <div className="text-sm text-text-tertiary">Total Phases</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {phaseTimeline.filter(p => p.status === 'completed').length}
              </div>
              <div className="text-sm text-text-tertiary">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">
                {phaseTimeline.filter(p => p.status === 'generating').length}
              </div>
              <div className="text-sm text-text-tertiary">In Progress</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {phaseTimeline.reduce((acc, p) => acc + p.files.length, 0)}
              </div>
              <div className="text-sm text-text-tertiary">Total Files</div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-800 mb-2">How to Use</h3>
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• Select different scenarios above to test various phase timeline states</li>
            <li>• Click on files in the timeline to view their contents and details</li>
            <li>• The timeline shows the exact structure users will see during code generation</li>
            <li>• "Sequential Phases" shows the target behavior with cumulative phases</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
