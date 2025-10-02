import React, { useState } from 'react';
import { ModelConfigTabs } from '@/components/model-config-tabs';
import { SettingsSection } from './settings-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Settings } from 'lucide-react';
import type { ModelConfigsData } from '@/api-types';

interface ModelConfigSectionProps {
  modelConfigs: ModelConfigsData;
  onConfigUpdate: (config: any) => void;
  onConfigDelete: (id: string) => void;
  onConfigCreate: () => void;
}

export function ModelConfigSection({
  modelConfigs,
  onConfigUpdate,
  onConfigDelete,
  onConfigCreate,
}: ModelConfigSectionProps) {
  const [activeTab, setActiveTab] = useState('default');

  return (
    <SettingsSection
      title="Model Configuration"
      description="Manage your AI model configurations and API keys"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <span className="font-medium">Model Configurations</span>
            <Badge variant="secondary">{modelConfigs.configs.length}</Badge>
          </div>
          <Button onClick={onConfigCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Configuration
          </Button>
        </div>

        {modelConfigs.configs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Settings className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Model Configurations</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first model configuration to get started with AI-powered code generation.
              </p>
              <Button onClick={onConfigCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create Configuration
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ModelConfigTabs
            configs={modelConfigs.configs}
            onConfigUpdate={onConfigUpdate}
            onConfigDelete={onConfigDelete}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        )}
      </div>
    </SettingsSection>
  );
}