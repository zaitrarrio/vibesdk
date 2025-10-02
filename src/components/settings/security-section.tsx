import React, { useState } from 'react';
import { SettingsSection } from './settings-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Eye, EyeOff, Lock, Trash2, Key } from 'lucide-react';
import type { ActiveSessionsData, EncryptedSecret } from '@/api-types';

interface SecuritySectionProps {
  activeSessions: ActiveSessionsData;
  secrets: EncryptedSecret[];
  onSessionRevoke: (sessionId: string) => void;
  onSecretDelete: (secretId: string) => void;
  onPasswordChange: (currentPassword: string, newPassword: string) => void;
}

export function SecuritySection({
  activeSessions,
  secrets,
  onSessionRevoke,
  onSecretDelete,
  onPasswordChange,
}: SecuritySectionProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: '',
  });

  const handlePasswordChange = () => {
    if (passwordForm.new !== passwordForm.confirm) {
      alert('New passwords do not match');
      return;
    }
    onPasswordChange(passwordForm.current, passwordForm.new);
    setPasswordForm({ current: '', new: '', confirm: '' });
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Active Sessions"
        description="Manage your active login sessions"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              <span className="font-medium">Active Sessions</span>
              <Badge variant="secondary">{activeSessions.sessions.length}</Badge>
            </div>
          </div>

          {activeSessions.sessions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Lock className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Active Sessions</h3>
                <p className="text-muted-foreground text-center">
                  You don't have any active sessions at the moment.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeSessions.sessions.map((session) => (
                <Card key={session.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{session.deviceName}</span>
                        {session.isCurrent && (
                          <Badge variant="default">Current</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Last active: {new Date(session.lastActive).toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        IP: {session.ipAddress}
                      </p>
                    </div>
                    {!session.isCurrent && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke Session</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to revoke this session? The user will be logged out from this device.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onSessionRevoke(session.id)}
                            >
                              Revoke Session
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="API Keys & Secrets"
        description="Manage your encrypted API keys and secrets"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              <span className="font-medium">Encrypted Secrets</span>
              <Badge variant="secondary">{secrets.length}</Badge>
            </div>
          </div>

          {secrets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Key className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Secrets</h3>
                <p className="text-muted-foreground text-center">
                  You haven't stored any encrypted secrets yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {secrets.map((secret) => (
                <Card key={secret.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{secret.name}</span>
                        <Badge variant="outline">{secret.provider}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Created: {new Date(secret.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Secret</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this secret? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onSecretDelete(secret.id)}
                          >
                            Delete Secret
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Change Password"
        description="Update your account password"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showPassword ? 'text' : 'password'}
                value={passwordForm.current}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, current: e.target.value }))}
                placeholder="Enter current password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={passwordForm.new}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, new: e.target.value }))}
              placeholder="Enter new password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm: e.target.value }))}
              placeholder="Confirm new password"
            />
          </div>

          <Button onClick={handlePasswordChange} disabled={!passwordForm.current || !passwordForm.new || !passwordForm.confirm}>
            Change Password
          </Button>
        </div>
      </SettingsSection>
    </div>
  );
}