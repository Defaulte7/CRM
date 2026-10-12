import { useState, useEffect, Component, type ReactNode } from 'react';
import { CRMData, Client, Activity, TabType, ActivityFilter, ActivityType, AdditionalContact } from './types';
import { ACTIVITY_TYPE_LABELS } from './types';
import { loadData, saveData, exportJSON, importJSON } from './utils/storage';
import { generateId, serializeToCSV, parseCSV } from './utils/csv';
import fileSyncEngine, { FileSyncEngine, FileSyncState, SyncStatus } from './utils/fileSync';
import { RichComment, RichCommentInput } from './components/RichComment';

// Error Boundary
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-xl mx-auto">
          <div className="bg-red-50 border-2 border-red-400 rounded-lg p-6">
            <h2 className="text-xl font-bold text-red-700 mb-2">❌ Ошибка в Мини-CRM</h2>
            <p className="text-red-600 mb-3">{this.state.error}</p>
            <button
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              🔄 Сбросить и перезагрузить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [data, setData] = useState<CRMData>({ clients: [], activities: [] });
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [reminderActivities, setReminderActivities] = useState<Activity[]>([]);
  const [currentReminder, setCurrentReminder] = useState<Activity | null>(null);
  const [syncState, setSyncState] = useState<FileSyncState>({
    status: 'disconnected',
    fileName: '',
    lastSync: '',
    lastError: '',
    fileLastModified: 0,
    pendingWrites: 0,
  });
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [showBanner, setShowBanner] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [preselectedClientId, setPreselectedClientId] = useState<string>('');

  // Load data from localStorage on mount
  useEffect(() => {
    const loaded = loadData();
    setData(loaded);
    requestNotificationPermission();
    
    // Setup file sync engine
    fileSyncEngine.setOnChange(setSyncState);
    fileSyncEngine.setDataUpdateCallback((newData: CRMData) => {
      setData(newData);
      saveData(newData);
    });
  }, []);

  // Save to localStorage and sync to file whenever data changes
  useEffect(() => {
    saveData(data);
    fileSyncEngine.updateData(data);
  }, [data]);

  // Check reminders every 30 seconds
  useEffect(() => {
    checkReminders();
    const interval = setInterval(checkReminders, 30000);
    return () => clearInterval(interval);
  }, [data]);

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'denied') {
        setShowBanner(true);
      }
    }
  };

  const createNewFile = async () => {
    await fileSyncEngine.createNewFile(data);
  };

  const openExistingFile = async () => {
    const result = await fileSyncEngine.openExistingFile();
    if (result) {
      setData(result);
      saveData(result);
    }
  };

  const forceSync = async () => {
    await fileSyncEngine.forceSync();
  };

  const forceReload = async () => {
    const result = await fileSyncEngine.forceReload();
    if (result) {
      setData(result);
      saveData(result);
    }
  };

  const downloadCSV = () => {
    const csv = serializeToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crm_database.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    setData(parsed);
    e.target.value = '';
  };

  const uploadJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await importJSON(file);
      setData(parsed);
    } catch (err) {
      alert('Ошибка: ' + (err as Error).message);
    }
    e.target.value = '';
  };

  const checkReminders = () => {
    const now = new Date();
    const due = data.activities.filter(a => {
      if (a.status !== 'planned') return false;
      if (a.postponedUntil) {
        return new Date(a.postponedUntil) <= now;
      }
      const actTime = getActivityDateTime(a);
      if (!actTime) return false;
      return actTime <= now;
    });

    if (due.length > 0) {
      setReminderActivities(due);
      if (!currentReminder && due.length > 0) {
        setCurrentReminder(due[0]);
      }
      if (notificationPermission === 'granted') {
        const n = new Notification('🔔 Мини-CRM: Напоминание', {
          body: `${due.length} задач(и) требуют внимания`,
          tag: 'crm-reminder',
        });
        n.onclick = () => {
          window.focus();
          setCurrentReminder(due[0]);
        };
      }
    }
  };

  const getActivityDateTime = (a: Activity): Date | null => {
    if (!a.date) return null;
    const time = a.time || '09:00';
    return new Date(`${a.date}T${time}:00`);
  };

  const saveClient = (client: Client) => {
    setData(prev => {
      const exists = prev.clients.find(c => c.id === client.id);
      if (exists) {
        return { ...prev, clients: prev.clients.map(c => c.id === client.id ? client : c) };
      }
      return { ...prev, clients: [...prev.clients, client] };
    });
    setShowClientForm(false);
    setEditingClient(null);
  };

  const archiveClient = (id: string) => {
    setData(prev => ({
      ...prev,
      clients: prev.clients.map(c => c.id === id ? { ...c, status: 'archived' as const } : c),
    }));
  };

  const restoreClient = (id: string) => {
    setData(prev => ({
      ...prev,
      clients: prev.clients.map(c => c.id === id ? { ...c, status: 'active' as const } : c),
    }));
  };

  const saveActivity = (activity: Activity) => {
    setData(prev => {
      const exists = prev.activities.find(a => a.id === activity.id);
      if (exists) {
        return { ...prev, activities: prev.activities.map(a => a.id === activity.id ? activity : a) };
      }
      return { ...prev, activities: [...prev.activities, activity] };
    });
    setShowActivityForm(false);
    setEditingActivity(null);
  };

  const completeActivity = (id: string, comment?: string, images?: string[]) => {
    setData(prev => ({
      ...prev,
      activities: prev.activities.map(a =>
        a.id === id ? { ...a, status: 'done' as const, comment: comment || a.comment, images: images || a.images, postponedUntil: undefined } : a
      ),
    }));
    setReminderActivities(prev => prev.filter(a => a.id !== id));
    if (currentReminder?.id === id) {
      const remaining = reminderActivities.filter(a => a.id !== id);
      setCurrentReminder(remaining.length > 0 ? remaining[0] : null);
    }
  };

  const postponeActivity = (id: string, minutes: number) => {
    const until = new Date(Date.now() + minutes * 60000).toISOString();
    setData(prev => ({
      ...prev,
      activities: prev.activities.map(a =>
        a.id === id ? { ...a, postponedUntil: until } : a
      ),
    }));
    setReminderActivities(prev => prev.filter(a => a.id !== id));
    if (currentReminder?.id === id) {
      const remaining = reminderActivities.filter(a => a.id !== id);
      setCurrentReminder(remaining.length > 0 ? remaining[0] : null);
    }
  };

  const archiveActivity = (id: string) => {
    setData(prev => ({
      ...prev,
      activities: prev.activities.map(a =>
        a.id === id ? { ...a, status: 'archived' as const } : a
      ),
    }));
  };

  const deleteActivity = (id: string) => {
    setData(prev => ({
      ...prev,
      activities: prev.activities.filter(a => a.id !== id),
    }));
  };

  const completeAndNext = (id: string, comment?: string, images?: string[]) => {
    const activity = data.activities.find(a => a.id === id);
    if (!activity) return;
    completeActivity(id, comment, images);
    setPreselectedClientId(activity.clientId);
    setEditingActivity(null);
    setShowActivityForm(true);
  };

  const filteredClients = data.clients.filter(c => {
    if (!showArchived && c.status === 'archived') return false;
    if (showArchived && c.status !== 'archived') return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.inn.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.contactPerson.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      c.comment.toLowerCase().includes(q)
    );
  });

  const filteredActivities = data.activities.filter(a => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    switch (activityFilter) {
      case 'today': return a.date === today && a.status === 'planned';
      case 'overdue': {
        const dt = getActivityDateTime(a);
        return a.status === 'planned' && dt && dt < now && !a.postponedUntil;
      }
      case 'pending': return a.status === 'planned';
      case 'done': return a.status === 'done';
      default: return a.status !== 'archived';
    }
  }).sort((a, b) => {
    const da = getActivityDateTime(a);
    const db = getActivityDateTime(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });

  const getClientName = (clientId: string) => data.clients.find(c => c.id === clientId)?.name || 'Неизвестный клиент';
  const getClientPhone = (clientId: string) => data.clients.find(c => c.id === clientId)?.phone || '';
  const hasFileSystemAPI = FileSyncEngine.isSupported();
  const todayActivities = data.activities.filter(a => a.date === new Date().toISOString().slice(0, 10) && a.status === 'planned').length;
  const overdueActivities = data.activities.filter(a => {
    const dt = getActivityDateTime(a);
    return a.status === 'planned' && dt && dt < new Date() && !a.postponedUntil;
  }).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold text-blue-800">📋 Мини-CRM</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {reminderActivities.length > 0 && (
              <button onClick={() => setCurrentReminder(reminderActivities[0])} className="px-3 py-1 bg-red-500 text-white rounded-full text-sm font-bold animate-pulse">
                🔔 {reminderActivities.length} сейчас
              </button>
            )}
            <FileSyncStatus syncState={syncState} hasFileSystemAPI={hasFileSystemAPI} />
            <div className="flex items-center gap-1">
              {hasFileSystemAPI ? (
                !fileSyncEngine.isConnected() ? (
                  <div className="flex gap-1">
                    <button onClick={createNewFile} className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">📄 Создать базу</button>
                    <button onClick={openExistingFile} className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">📂 Открыть базу</button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button onClick={forceSync} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200" title="Сохранить в файл">💾</button>
                    <button onClick={forceReload} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200" title="Перечитать из файла">🔄</button>
                  </div>
                )
              ) : (
                <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">⚠️ Ручной режим</span>
              )}
            </div>
            <div className="flex gap-1">
              <button onClick={downloadCSV} className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300">⬇ CSV</button>
              <label className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300 cursor-pointer">
                ⬆ CSV<input type="file" accept=".csv" onChange={uploadCSV} className="hidden" />
              </label>
              <button onClick={() => exportJSON(data)} className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300">💾 JSON</button>
              <label className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300 cursor-pointer">
                📥 JSON<input type="file" accept=".json" onChange={uploadJSON} className="hidden" />
              </label>
            </div>
          </div>
        </div>
        {syncState.lastError && (
          <div className="bg-yellow-100 border-t border-yellow-300 px-4 py-2 text-sm text-yellow-800 flex justify-between">
            <span>⚠️ {syncState.lastError}</span>
            <button onClick={() => setSyncState(s => ({ ...s, lastError: '' }))} className="text-yellow-600">✕</button>
          </div>
        )}
        {showBanner && (
          <div className="bg-yellow-100 border-t border-yellow-300 px-4 py-2 text-sm text-yellow-800 flex justify-between">
            <span>⚠️ Уведомления отключены</span>
            <button onClick={() => setShowBanner(false)} className="text-yellow-600">✕</button>
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 flex gap-1">
          {(['dashboard', 'clients', 'activities'] as TabType[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 text-sm font-medium rounded-t ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {tab === 'dashboard' ? '📊 Панель' : tab === 'clients' ? `👥 Клиенты (${data.clients.filter(c => c.status === 'active').length})` : '📅 Активности'}
              {tab === 'activities' && overdueActivities > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 inline-flex items-center justify-center">{overdueActivities}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {activeTab === 'dashboard' && <DashboardView data={data} todayActivities={todayActivities} overdueActivities={overdueActivities} reminderCount={reminderActivities.length} onGoToActivities={() => setActiveTab('activities')} onGoToClients={() => setActiveTab('clients')} />}
        {activeTab === 'clients' && <ClientsView clients={filteredClients} searchQuery={searchQuery} onSearchChange={setSearchQuery} showArchived={showArchived} onToggleArchived={() => setShowArchived(!showArchived)} onNewClient={() => { setEditingClient(null); setShowClientForm(true); }} onEditClient={(c: Client) => { setEditingClient(c); setShowClientForm(true); }} onArchiveClient={archiveClient} onRestoreClient={restoreClient} onSaveClient={saveClient} showForm={showClientForm} editingClient={editingClient} onCloseForm={() => { setShowClientForm(false); setEditingClient(null); }} data={data} />}
        {activeTab === 'activities' && <ActivitiesView activities={filteredActivities} filter={activityFilter} onFilterChange={setActivityFilter} clients={data.clients} onNewActivity={() => { setEditingActivity(null); setShowActivityForm(true); }} onEditActivity={(a: Activity) => { setEditingActivity(a); setShowActivityForm(true); }} onComplete={completeActivity} onArchive={archiveActivity} onDelete={deleteActivity} onSaveActivity={saveActivity} showForm={showActivityForm} editingActivity={editingActivity} onCloseForm={() => { setShowActivityForm(false); setEditingActivity(null); setPreselectedClientId(''); }} preselectedClientId={preselectedClientId} getClientName={getClientName} />}
      </main>

      {currentReminder && (
        <ReminderModal activity={currentReminder} clientName={getClientName(currentReminder.clientId)} clientPhone={getClientPhone(currentReminder.clientId)} onComplete={(comment: string, images: string[]) => completeActivity(currentReminder.id, comment, images)} onCompleteAndNext={(comment: string, images: string[]) => completeAndNext(currentReminder.id, comment, images)} onPostpone15={() => postponeActivity(currentReminder.id, 15)} onPostpone10={() => postponeActivity(currentReminder.id, 10)} onSaveComment={(comment: string, images: string[]) => setData(prev => ({ ...prev, activities: prev.activities.map(a => a.id === currentReminder.id ? { ...a, comment, images } : a) }))} onClose={() => { const remaining = reminderActivities.filter(a => a.id !== currentReminder.id); setCurrentReminder(remaining.length > 0 ? remaining[0] : null); }} />
      )}
    </div>
  );
}

function FileSyncStatus({ syncState, hasFileSystemAPI }: { syncState: FileSyncState; hasFileSystemAPI: boolean }) {
  if (!hasFileSystemAPI) return <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">⚠️ Ручной режим</span>;
  if (!fileSyncEngine.isConnected()) return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">🔌 База не подключена</span>;
  const config: Record<SyncStatus, { bg: string; text: string; icon: string }> = {
    disconnected: { bg: 'bg-gray-100', text: 'text-gray-600', icon: '🔌' },
    connecting: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: '⏳' },
    connected: { bg: 'bg-green-100', text: 'text-green-800', icon: '✅' },
    syncing: { bg: 'bg-blue-100', text: 'text-blue-800', icon: '💾' },
    reading: { bg: 'bg-purple-100', text: 'text-purple-800', icon: '📖' },
    error: { bg: 'bg-red-100', text: 'text-red-800', icon: '❌' },
    readonly: { bg: 'bg-orange-100', text: 'text-orange-800', icon: '🔒' },
  };
  const c = config[syncState.status];
  return (
    <span className={`px-2 py-1 ${c.bg} ${c.text} rounded text-xs font-medium`}>
      {c.icon} {syncState.fileName}{syncState.lastSync && <span className="ml-1">({syncState.lastSync})</span>}
      {syncState.pendingWrites > 0 && <span className="ml-1">⏳</span>}
    </span>
  );
}

function DashboardView({ data, todayActivities, overdueActivities, reminderCount, onGoToActivities, onGoToClients }: { data: CRMData; todayActivities: number; overdueActivities: number; reminderCount: number; onGoToActivities: () => void; onGoToClients: () => void }) {
  const activeClients = data.clients.filter(c => c.status === 'active').length;
  const doneToday = data.activities.filter(a => a.status === 'done' && a.date === new Date().toISOString().slice(0, 10)).length;
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Панель управления</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500"><div className="text-3xl font-bold text-blue-600">{activeClients}</div><div className="text-sm text-gray-600">Активных клиентов</div><button onClick={onGoToClients} className="text-xs text-blue-500 hover:underline mt-1">Перейти →</button></div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500"><div className="text-3xl font-bold text-green-600">{todayActivities}</div><div className="text-sm text-gray-600">Задач на сегодня</div><button onClick={onGoToActivities} className="text-xs text-green-500 hover:underline mt-1">Перейти →</button></div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500"><div className="text-3xl font-bold text-red-600">{overdueActivities}</div><div className="text-sm text-gray-600">Просроченных</div><button onClick={onGoToActivities} className="text-xs text-red-500 hover:underline mt-1">Перейти →</button></div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500"><div className="text-3xl font-bold text-purple-600">{doneToday}</div><div className="text-sm text-gray-600">Выполнено сегодня</div></div>
      </div>
      {reminderCount > 0 && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6"><h3 className="font-bold text-red-700 mb-2">🔔 Требуют внимания: {reminderCount}</h3></div>}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-bold text-gray-800 mb-4">📅 Ближайшие задачи</h3>
        {data.activities.filter(a => a.status === 'planned').sort((a, b) => (a.date + (a.time || '09:00')).localeCompare(b.date + (b.time || '09:00'))).slice(0, 5).map(a => {
          const client = data.clients.find(c => c.id === a.clientId);
          const isOverdue = a.date && new Date(`${a.date}T${a.time || '09:00'}:00`) < new Date();
          return (
            <div key={a.id} className={`flex items-center gap-3 py-2 border-b last:border-0 ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
              <span className="text-sm font-mono">{a.date} {a.time || '09:00'}</span>
              <span className="text-sm">{ACTIVITY_TYPE_LABELS[a.type]}</span>
              <span className="text-sm font-medium">{a.subject}</span>
              <span className="text-xs text-gray-500">— {client?.name || '?'}</span>
              {isOverdue && <span className="text-xs bg-red-100 text-red-700 px-1 rounded">просрочено</span>}
            </div>
          );
        })}
        {data.activities.filter(a => a.status === 'planned').length === 0 && <p className="text-gray-500 text-sm">Нет запланированных задач</p>}
      </div>
    </div>
  );
}

function ClientsView({ clients, searchQuery, onSearchChange, showArchived, onToggleArchived, onNewClient, onEditClient, onArchiveClient, onRestoreClient, onSaveClient, showForm, editingClient, onCloseForm, data }: { clients: Client[]; searchQuery: string; onSearchChange: (q: string) => void; showArchived: boolean; onToggleArchived: () => void; onNewClient: () => void; onEditClient: (c: Client) => void; onArchiveClient: (id: string) => void; onRestoreClient: (id: string) => void; onSaveClient: (c: Client) => void; showForm: boolean; editingClient: Client | null; onCloseForm: () => void; data: CRMData }) {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-gray-800">{showArchived ? '📦 Архив клиентов' : '👥 Клиенты'}</h2>
        <div className="flex gap-2">
          <button onClick={onToggleArchived} className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300">{showArchived ? '↩ Активные' : '📦 Архив'}</button>
          <button onClick={onNewClient} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">+ Новый клиент</button>
        </div>
      </div>
      <div className="mb-4"><input type="text" placeholder="🔍 Поиск..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
      {showForm && <ClientForm client={editingClient} onSave={onSaveClient} onClose={onCloseForm} />}
      {selectedClient && !showForm && <ClientDetail client={selectedClient} data={data} onClose={() => setSelectedClient(null)} onEdit={() => { onEditClient(selectedClient); }} onArchive={() => { onArchiveClient(selectedClient.id); setSelectedClient(null); }} onRestore={() => { onRestoreClient(selectedClient.id); setSelectedClient(null); }} />}
      {!selectedClient && !showForm && (
        <div className="space-y-2">
          {clients.map(c => (
            <div key={c.id} className="bg-white rounded-lg shadow p-4 hover:shadow-md transition cursor-pointer flex items-center justify-between" onClick={() => setSelectedClient(c)}>
              <div><div className="font-medium text-gray-800">{c.name}</div><div className="text-sm text-gray-500">{c.contactPerson && <span>👤 {c.contactPerson} </span>}{c.phone && <span>📞 {c.phone} </span>}{c.inn && <span>ИНН: {c.inn}</span>}</div></div>
              <div className="flex gap-2">
                {c.status === 'archived' ? <button onClick={(e) => { e.stopPropagation(); onRestoreClient(c.id); }} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200">↩ Восстановить</button> : <button onClick={(e) => { e.stopPropagation(); onArchiveClient(c.id); }} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200">📦 В архив</button>}
              </div>
            </div>
          ))}
          {clients.length === 0 && <div className="text-center py-8 text-gray-500">{searchQuery ? 'Ничего не найдено' : 'Нет клиентов'}</div>}
        </div>
      )}
    </div>
  );
}

function ClientForm({ client, onSave, onClose }: { client: Client | null; onSave: (c: Client) => void; onClose: () => void }) {
  const [form, setForm] = useState<Client>(client || { id: generateId(), name: '', contactPerson: '', inn: '', kpp: '', ogrn: '', address: '', phone: '', email: '', website: '', bankDetails: '', comment: '', images: [], status: 'active', additionalContacts: [], createdAt: new Date().toISOString() });
  const addContact = () => setForm(prev => ({ ...prev, additionalContacts: [...prev.additionalContacts, { id: generateId(), fio: '', position: '', phone: '', email: '' }] }));
  const updateContact = (idx: number, field: keyof AdditionalContact, value: string) => setForm(prev => ({ ...prev, additionalContacts: prev.additionalContacts.map((c, i) => i === idx ? { ...c, [field]: value } : c) }));
  const removeContact = (idx: number) => setForm(prev => ({ ...prev, additionalContacts: prev.additionalContacts.filter((_, i) => i !== idx) }));
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!form.name.trim()) { alert('Наименование обязательно'); return; } onSave(form); };
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border-2 border-blue-200">
      <h3 className="text-lg font-bold mb-4">{client ? '✏️ Редактирование' : '➕ Новый клиент'}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Наименование *</label><input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Контактное лицо</label><input value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} className="w-full px-3 py-2 border rounded" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">ИНН</label><input value={form.inn} onChange={e => setForm(p => ({ ...p, inn: e.target.value }))} className="w-full px-3 py-2 border rounded" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">КПП</label><input value={form.kpp} onChange={e => setForm(p => ({ ...p, kpp: e.target.value }))} className="w-full px-3 py-2 border rounded" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2 border rounded" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full px-3 py-2 border rounded" /></div>
        </div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Адрес</label><input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="w-full px-3 py-2 border rounded" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label><RichCommentInput value={form.comment} onChange={(val) => setForm(p => ({ ...p, comment: val }))} images={form.images} onImagesChange={(imgs) => setForm(p => ({ ...p, images: imgs }))} /></div>
        <div>
          <div className="flex items-center justify-between mb-2"><label className="text-sm font-medium text-gray-700">Доп. контакты</label><button type="button" onClick={addContact} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">+ Добавить</button></div>
          {form.additionalContacts.map((ac, idx) => (<div key={ac.id} className="grid grid-cols-5 gap-2 mb-2 p-2 bg-gray-50 rounded"><input placeholder="ФИО" value={ac.fio} onChange={e => updateContact(idx, 'fio', e.target.value)} className="px-2 py-1 border rounded text-sm" /><input placeholder="Должность" value={ac.position} onChange={e => updateContact(idx, 'position', e.target.value)} className="px-2 py-1 border rounded text-sm" /><input placeholder="Телефон" value={ac.phone} onChange={e => updateContact(idx, 'phone', e.target.value)} className="px-2 py-1 border rounded text-sm" /><input placeholder="E-mail" value={ac.email} onChange={e => updateContact(idx, 'email', e.target.value)} className="px-2 py-1 border rounded text-sm" /><button type="button" onClick={() => removeContact(idx)} className="text-red-500 text-sm">✕</button></div>))}
        </div>
        <div className="flex gap-2 pt-4"><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">💾 Сохранить</button><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Отмена</button></div>
      </form>
    </div>
  );
}

function ClientDetail({ client, data, onClose, onEdit, onArchive, onRestore }: { client: Client; data: CRMData; onClose: () => void; onEdit: () => void; onArchive: () => void; onRestore: () => void }) {
  const clientActivities = data.activities.filter(a => a.clientId === client.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-800">{client.name}</h3>
        <div className="flex gap-2">
          <button onClick={onEdit} className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm">✏️ Редактировать</button>
          {client.status === 'active' ? <button onClick={onArchive} className="px-3 py-1 bg-gray-100 text-gray-700 rounded text-sm">📦 В архив</button> : <button onClick={onRestore} className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm">↩ Восстановить</button>}
          <button onClick={onClose} className="px-3 py-1 bg-gray-100 rounded text-sm">✕</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="space-y-2">
          {client.contactPerson && <div><span className="text-sm text-gray-500">Контакт:</span> <span className="font-medium">{client.contactPerson}</span></div>}
          {client.phone && <div><span className="text-sm text-gray-500">Телефон:</span> <a href={`tel:${client.phone}`} className="text-blue-600">{client.phone}</a></div>}
          {client.email && <div><span className="text-sm text-gray-500">E-mail:</span> <a href={`mailto:${client.email}`} className="text-blue-600">{client.email}</a></div>}
        </div>
        <div className="space-y-2">
          {client.inn && <div><span className="text-sm text-gray-500">ИНН:</span> {client.inn}</div>}
          {client.address && <div><span className="text-sm text-gray-500">Адрес:</span> {client.address}</div>}
        </div>
      </div>
      {(client.comment || (client.images && client.images.length > 0)) && (
        <div className="mb-6"><h4 className="font-medium text-gray-700 mb-1">Комментарий:</h4><div className="text-sm bg-yellow-50 rounded p-3"><RichComment text={client.comment} images={client.images} /></div></div>
      )}
      <div>
        <h4 className="font-medium text-gray-700 mb-2">📅 История ({clientActivities.length}):</h4>
        {clientActivities.length === 0 ? <p className="text-sm text-gray-500">Нет активностей</p> : (
          <div className="space-y-1">{clientActivities.map(a => (
            <div key={a.id} className={`text-sm p-2 rounded ${a.status === 'done' ? 'bg-green-50' : 'bg-blue-50'}`}>
              <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-xs">{a.date} {a.time || '09:00'}</span><span>{ACTIVITY_TYPE_LABELS[a.type]}</span><span className="font-medium">{a.subject}</span><span className={`text-xs px-1 rounded ${a.status === 'done' ? 'bg-green-200 text-green-800' : 'bg-blue-200 text-blue-800'}`}>{a.status === 'done' ? '✅' : '⏳'}</span></div>
              {(a.comment || (a.images && a.images.length > 0)) && <div className="text-xs text-gray-500 mt-1"><RichComment text={a.comment} images={a.images} /></div>}
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}

function ActivitiesView({ activities, filter, onFilterChange, clients, onNewActivity, onEditActivity, onComplete, onArchive, onDelete, onSaveActivity, showForm, editingActivity, onCloseForm, preselectedClientId, getClientName }: { activities: Activity[]; filter: ActivityFilter; onFilterChange: (f: ActivityFilter) => void; clients: Client[]; onNewActivity: () => void; onEditActivity: (a: Activity) => void; onComplete: (id: string) => void; onArchive: (id: string) => void; onDelete: (id: string) => void; onSaveActivity: (a: Activity) => void; showForm: boolean; editingActivity: Activity | null; onCloseForm: () => void; preselectedClientId: string; getClientName: (id: string) => string }) {
  const now = new Date();
  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-gray-800">📅 Активности</h2>
        <button onClick={onNewActivity} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">+ Новая</button>
      </div>
      <div className="flex gap-1 mb-4 flex-wrap">{([['all', 'Все'], ['today', 'Сегодня'], ['overdue', 'Просроченные'], ['pending', 'Незакрытые'], ['done', 'Выполненные']] as [ActivityFilter, string][]).map(([key, label]) => (<button key={key} onClick={() => onFilterChange(key)} className={`px-3 py-1 rounded text-sm ${filter === key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>{label}</button>))}</div>
      {showForm && <ActivityForm activity={editingActivity} clients={clients} onSave={onSaveActivity} onClose={onCloseForm} preselectedClientId={preselectedClientId} />}
      {!showForm && (
        <div className="space-y-2">{activities.map(a => {
          const isOverdue = a.status === 'planned' && a.date && new Date(`${a.date}T${a.time || '09:00'}:00`) < now && !a.postponedUntil;
          return (
            <div key={a.id} className={`bg-white rounded-lg shadow p-4 flex items-center justify-between ${isOverdue ? 'border-l-4 border-red-500' : 'border-l-4 border-blue-300'}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-sm text-gray-600">{a.date} {a.time || '09:00'}</span><span className="text-sm">{ACTIVITY_TYPE_LABELS[a.type]}</span><span className="font-medium text-gray-800">{a.subject}</span><span className="text-xs text-gray-500">— {getClientName(a.clientId)}</span>{isOverdue && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">⚠️ Просрочено</span>}{a.status === 'done' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">✅</span>}</div>
                {(a.comment || (a.images && a.images.length > 0)) && <div className="text-xs text-gray-500 mt-1 max-w-md"><RichComment text={a.comment} images={a.images} /></div>}
              </div>
              <div className="flex gap-1 ml-2">
                {a.status === 'planned' && <button onClick={() => onComplete(a.id)} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">✅</button>}
                <button onClick={() => onEditActivity(a)} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">✏️</button>
                <button onClick={() => onArchive(a.id)} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">📦</button>
                <button onClick={() => { if (confirm('Удалить?')) onDelete(a.id); }} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">🗑️</button>
              </div>
            </div>
          );
        })}{activities.length === 0 && <div className="text-center py-8 text-gray-500">Нет активностей</div>}</div>
      )}
    </div>
  );
}

function ActivityForm({ activity, clients, onSave, onClose, preselectedClientId }: { activity: Activity | null; clients: Client[]; onSave: (a: Activity) => void; onClose: () => void; preselectedClientId: string }) {
  const [form, setForm] = useState<Activity>(activity || { id: generateId(), clientId: preselectedClientId || (clients.length > 0 ? clients[0].id : ''), date: new Date().toISOString().slice(0, 10), time: '', type: 'call', subject: '', comment: '', images: [], status: 'planned', createdAt: new Date().toISOString() });
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!form.clientId || !form.date) { alert('Заполните обязательные поля'); return; } onSave(form); };
  const activeClients = clients.filter(c => c.status === 'active');
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6 border-2 border-blue-200">
      <h3 className="text-lg font-bold mb-4">{activity ? '✏️ Редактирование' : '➕ Новая активность'}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Клиент *</label><select required value={form.clientId} onChange={e => setForm(p => ({ ...p, clientId: e.target.value }))} className="w-full px-3 py-2 border rounded"><option value="">— Выберите —</option>{activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Тип</label><select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as ActivityType }))} className="w-full px-3 py-2 border rounded">{Object.entries(ACTIVITY_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Дата *</label><input required type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="w-full px-3 py-2 border rounded" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Время</label><input type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} className="w-full px-3 py-2 border rounded" /></div>
        </div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Тема</label><input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} className="w-full px-3 py-2 border rounded" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label><RichCommentInput value={form.comment} onChange={(val) => setForm(p => ({ ...p, comment: val }))} images={form.images} onImagesChange={(imgs) => setForm(p => ({ ...p, images: imgs }))} /></div>
        <div className="flex gap-2 pt-4"><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">💾 Сохранить</button><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Отмена</button></div>
      </form>
    </div>
  );
}

function ReminderModal({ activity, clientName, clientPhone, onComplete, onCompleteAndNext, onPostpone15, onPostpone10, onSaveComment, onClose }: { activity: Activity; clientName: string; clientPhone: string; onComplete: (comment: string, images: string[]) => void; onCompleteAndNext: (comment: string, images: string[]) => void; onPostpone15: () => void; onPostpone10: () => void; onSaveComment: (comment: string, images: string[]) => void; onClose: () => void }) {
  const [comment, setComment] = useState(activity.comment || '');
  const [images, setImages] = useState<string[]>(activity.images || []);
  const [copied, setCopied] = useState(false);
  const copyPhone = () => { navigator.clipboard.writeText(clientPhone).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-red-500 text-white px-6 py-4 rounded-t-xl"><h3 className="text-xl font-bold">🔔 {ACTIVITY_TYPE_LABELS[activity.type]}</h3><p className="text-red-100 text-sm">{activity.date} {activity.time || '09:00'}</p></div>
        <div className="p-6 space-y-4">
          <div><div className="text-sm text-gray-500">Клиент</div><div className="text-lg font-bold text-gray-800">{clientName}</div></div>
          {activity.subject && <div><div className="text-sm text-gray-500">Тема</div><div className="font-medium">{activity.subject}</div></div>}
          {clientPhone && <div className="bg-blue-50 rounded-lg p-3"><div className="text-sm text-gray-500 mb-1">Телефон</div><div className="flex items-center gap-2"><a href={`tel:${clientPhone}`} className="text-xl font-bold text-blue-600">📞 {clientPhone}</a><button onClick={copyPhone} className="px-2 py-1 bg-blue-200 text-blue-800 rounded text-xs">{copied ? '✓' : '📋 Копировать'}</button></div></div>}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Комментарий</label><RichCommentInput value={comment} onChange={setComment} images={images} onImagesChange={setImages} placeholder="Результат звонка..." /></div>
          <div className="space-y-2">
            <div className="flex gap-2"><button onClick={() => onComplete(comment, images)} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">✅ Завершить</button><button onClick={() => onCompleteAndNext(comment, images)} className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">📅 + Следующая</button></div>
            <div className="flex gap-2"><button onClick={onPostpone15} className="flex-1 px-3 py-2 bg-yellow-100 text-yellow-800 rounded-lg">⏰ +15 мин</button><button onClick={onPostpone10} className="flex-1 px-3 py-2 bg-yellow-100 text-yellow-800 rounded-lg">⏰ +10 мин</button><button onClick={() => onSaveComment(comment, images)} className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg">💾 Сохранить</button></div>
            <button onClick={onClose} className="w-full px-3 py-2 bg-gray-200 text-gray-700 rounded-lg">✕ Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppWithBoundary() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}

export default AppWithBoundary;
