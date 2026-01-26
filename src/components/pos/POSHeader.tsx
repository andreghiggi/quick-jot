import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, RefreshCw, LogOut, History } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';

interface POSHeaderProps {
  isOnline: boolean;
  pendingSyncCount: number;
  onSync: () => void;
  onLogout: () => void;
  onShowHistory: () => void;
  syncing?: boolean;
}

export function POSHeader({ 
  isOnline, 
  pendingSyncCount, 
  onSync, 
  onLogout, 
  onShowHistory,
  syncing 
}: POSHeaderProps) {
  const { profile, company } = useAuthContext();

  return (
    <header className="bg-card border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-bold">{company?.name || 'POS'}</h1>
          <p className="text-xs text-muted-foreground">{profile?.full_name || profile?.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Online/Offline status */}
        <Badge variant={isOnline ? 'default' : 'destructive'} className="gap-1">
          {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {isOnline ? 'Online' : 'Offline'}
        </Badge>

        {/* Pending sync */}
        {pendingSyncCount > 0 && (
          <Badge variant="secondary" className="gap-1">
            <RefreshCw className="h-3 w-3" />
            {pendingSyncCount}
          </Badge>
        )}

        {/* Sync button */}
        <Button 
          variant="ghost" 
          size="icon"
          onClick={onSync}
          disabled={!isOnline || syncing}
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
        </Button>

        {/* History */}
        <Button 
          variant="ghost" 
          size="icon"
          onClick={onShowHistory}
        >
          <History className="h-4 w-4" />
        </Button>

        {/* Logout */}
        <Button 
          variant="ghost" 
          size="icon"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
