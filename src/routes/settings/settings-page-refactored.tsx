import React, { useState, useEffect } from 'react';
import { SettingsLayout } from '@/components/settings/settings-layout';
import { ModelConfigSection } from '@/components/settings/model-config-section';
import { SecuritySection } from '@/components/settings/security-section';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Smartphone, Settings, User } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import type {
  ModelConfigsData,
  ModelConfigUpdate,
  EncryptedSecret,
  ActiveSessionsData,
} from '@/api-types';

export function SettingsPageRefactored() {
  const { user } = useAuth();
  const [modelConfigs, setModelConfigs] = useState<ModelConfigsData>({
    configs: [],
    defaults: null,
  });
  const [activeSessions, setActiveSessions] = useState<ActiveSessionsData>({
    sessions: [],
  });
  const [secrets, setSecrets] = useState<EncryptedSecret[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettingsData();
  }, []);

  const loadSettingsData = async () => {
    try {
      setLoading(true);
      // Mock data loading - replace with actual API calls
      setModelConfigs({
        configs: [
          {
            id: 'config-1',
            name: 'Default Configuration',
            provider: 'openai',
            model: 'gpt-4',
            isDefault: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        defaults: {
          provider: 'openai',
          model: 'gpt-4',
        },
      });

      setActiveSessions({
        sessions: [
          {
            id: 'session-1',
            deviceName: 'Chrome on Windows',
            ipAddress: '192.168.1.100',
            lastActive: Date.now() - 3600000,
            isCurrent: true,
          },
        ],
      });

      setSecrets([
        {
          id: 'secret-1',
          name: 'OpenAI API Key',
          provider: 'openai',
          createdAt: Date.now(),
        },
      ]);
    } catch (error) {
      console.error('Failed to load settings data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigUpdate = async (config: ModelConfigUpdate) => {
    try {
      // Mock API call - replace with actual implementation
      console.log('Updating config:', config);
      
      // Update local state
      setModelConfigs(prev => ({
        ...prev,
        configs: prev.configs.map(c => 
          c.id === config.id ? { ...c, ...config } : c
        ),
      }));
    } catch (error) {
      console.error('Failed to update config:', error);
    }
  };

  const handleConfigDelete = async (id: string) => {
    try {
      // Mock API call - replace with actual implementation
      console.log('Deleting config:', id);
      
      // Update local state
      setModelConfigs(prev => ({
        ...prev,
        configs: prev.configs.filter(c => c.id !== id),
      }));
    } catch (error) {
      console.error('Failed to delete config:', error);
    }
  };

  const handleConfigCreate = async () => {
    try {
      // Mock API call - replace with actual implementation
      console.log('Creating new config');
      
      const newConfig = {
        id: `config-${Date.now()}`,
        name: 'New Configuration',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        isDefault: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      
      setModelConfigs(prev => ({
        ...prev,
        configs: [...prev.configs, newConfig],
      }));
    } catch (error) {
      console.error('Failed to create config:', error);
    }
  };

  const handleSessionRevoke = async (sessionId: string) => {
    try {
      // Mock API call - replace with actual implementation
      console.log('Revoking session:', sessionId);
      
      setActiveSessions(prev => ({
        ...prev,
        sessions: prev.sessions.filter(s => s.id !== sessionId),
      }));
    } catch (error) {
      console.error('Failed to revoke session:', error);
    }
  };

  const handleSecretDelete = async (secretId: string) => {
    try {
      // Mock API call - replace with actual implementation
      console.log('Deleting secret:', secretId);
      
      setSecrets(prev => prev.filter(s => s.id !== secretId));
    } catch (error) {
      console.error('Failed to delete secret:', error);
    }
  };

  const handlePasswordChange = async (currentPassword: string, newPassword: string) => {
    try {
      // Mock API call - replace with actual implementation
      console.log('Changing password');
      alert('Password changed successfully');
    } catch (error) {
      console.error('Failed to change password:', error);
      alert('Failed to change password');
    }
  };

  if (loading) {
    return (
      <SettingsLayout title="Settings" description="Manage your account settings">
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout 
      title="Settings" 
      description="Manage your account settings and preferences"
    >
      {/* User Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">{user?.name || 'User'}</h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            
            <Separator />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Account Type</p>
                <Badge variant="secondary">Free</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Member Since</p>
                <p className="text-sm">{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model Configuration Section */}
      <ModelConfigSection
        modelConfigs={modelConfigs}
        onConfigUpdate={handleConfigUpdate}
        onConfigDelete={handleConfigDelete}
        onConfigCreate={handleConfigCreate}
      />

      {/* Security Section */}
      <SecuritySection
        activeSessions={activeSessions}
        secrets={secrets}
        onSessionRevoke={handleSessionRevoke}
        onSecretDelete={handleSecretDelete}
        onPasswordChange={handlePasswordChange}
      />

      {/* Mobile App Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Mobile App
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Download our mobile app for iOS and Android to access your projects on the go.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                Download for iOS
              </Button>
              <Button variant="outline" size="sm">
                Download for Android
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </SettingsLayout>
  );
}