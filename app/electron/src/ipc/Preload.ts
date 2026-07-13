import { contextBridge, ipcRenderer } from 'electron';

const invokable = new Set<string>([
    'ApplicationWindow::ShowWindow',
    'ApplicationWindow::HideWindow',
    'ApplicationWindow::Minimize',
    'ApplicationWindow::Maximize',
    'ApplicationWindow::Restore',
    'ApplicationWindow::Close',
    'ApplicationWindow::OpenSplash',
    'ApplicationWindow::CloseSplash',
    'FetchProvider::Initialize',
    'RemoteBrowserWindowController::OpenWindow',
    'RemoteBrowserWindowController::CloseWindow',
    'RemoteBrowserWindowController::SetVisibility',
    'RemoteBrowserWindowController::ExecuteScript',
    'RemoteBrowserWindowController::LoadURL',
    'RemoteProcedureCallManager::Stop',
    'RemoteProcedureCallManager::Restart',
    'BloatGuard::Initialize',
    'PortableStorage::WriteFile',
]);

const subscribable = new Set<string>([
    'RemoteBrowserWindowController::OnDomReady',
    'RemoteBrowserWindowController::OnBeforeNavigate',
    'RemoteProcedureCallContract::LoadMediaContainerFromURL',
]);

function AssertChannel(channels: Set<string>, channel: string): void {
    if(!channels.has(channel)) {
        throw new Error(`Unsupported IPC channel: ${channel}`);
    }
}

contextBridge.exposeInMainWorld('ipcRenderer', {
    invoke: (channel: string, ...parameters: JSONArray) => {
        AssertChannel(invokable, channel);
        return ipcRenderer.invoke(channel, ...parameters);
    },
    on: (channel: string, callback: (...parameters: JSONArray) => void) => {
        AssertChannel(subscribable, channel);
        ipcRenderer.on(channel, (_event, ...parameters: JSONArray) => callback(...parameters));
    },
});

contextBridge.exposeInMainWorld('portableStorage', {
    writeFile: (segments: string[], data: ArrayBuffer) => ipcRenderer.invoke('PortableStorage::WriteFile', segments, data),
});
