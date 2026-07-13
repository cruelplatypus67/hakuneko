import path from 'path';
import fs from 'fs/promises';
import { pathToFileURL } from 'node:url';
import { app, shell } from 'electron';
import { Command } from 'commander';
import { IPC } from './ipc/InterProcessCommunication';
import { ApplicationWindow } from './ipc/ApplicationWindow';
import { FetchProvider } from './ipc/FetchProvider';
import { InitializeMenu } from './Menu';
import { BloatGuard } from './ipc/BloatGuard';
import { RemoteBrowserWindowController } from './ipc/RemoteBrowserWindow';
import { RPCServer } from '../../src/rpc/Server';
import { RemoteProcedureCallManager } from './ipc/RemoteProcedureCallManager';
import { RemoteProcedureCallContract } from './ipc/RemoteProcedureCallContract';
import { PortableStorage } from './ipc/PortableStorage';

type CLIOptions = {
    origin?: string;
    portableRoot?: string;
}

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.enableSandbox();

function ParseCLI(): CLIOptions {
    try {
        const argv = new Command()
            .allowUnknownOption(true)
            .allowExcessArguments(true)
            .option('--origin [url]', 'custom location from which the web-app shall be loaded')
            .option('--portable-root [path]', 'directory for portable downloads')
            .parse(process.argv, { from: 'electron' });
        return argv.opts<CLIOptions>();
    } catch {
        return {};
    }
}

type Manifest = {
    url: string;
    'user-agent': undefined | string;
    'user-data-dir': undefined | string;
};

async function LoadManifest(): Promise<Manifest> {
    const file = path.resolve(app.getAppPath(), 'package.json');
    const content = await fs.readFile(path.normalize(file), { encoding: 'utf-8' });
    return JSON.parse(content) as Manifest;
}

async function SetupUserDataDirectory(manifest: Manifest): Promise<void> {
    const userDataDir = manifest['user-data-dir'];
    // TODO: Do not replace when already set via commandline
    if(/* !argv['user-data-dir'] && */ userDataDir) {
        app.setPath('userData', path.isAbsolute(userDataDir) ? userDataDir : path.resolve(path.dirname(app.getPath('exe')), userDataDir));
    }
}

async function CreateApplicationWindow(): Promise<ApplicationWindow> {
    const win = new ApplicationWindow({
        show: false,
        width: 1280,
        height: 800,
        minWidth: 1280,
        minHeight: 720,
        center: true,
        frame: false,
        transparent: true,
        //icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
        webPreferences: {
            sandbox: true,
            webSecurity: false, // Bypass CORS checks
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            nodeIntegrationInSubFrames: false,
            disableBlinkFeatures: 'AutomationControlled',
            preload: path.resolve(app.getAppPath(), 'preload.js'),
        },
    });

    win.setMenuBarVisibility(false);
    win.on('closed', () => app.quit());

    return win;
}

function CheckOrigin(url: string, appURI: URL) {
    try {
        return new URL(url).origin === appURI.origin;
    } catch {
        return false;
    }
}

function CheckTrustedURL(url: string, appURI: URL): boolean {
    try {
        const candidate = new URL(url);
        return appURI.protocol === 'file:' ? candidate.href === appURI.href : candidate.origin === appURI.origin;
    } catch {
        return false;
    }
}

function UpdatePermissions(session: Electron.Session, webContents: Electron.WebContents, appURI: URL) {
    const allowed = new Set([ 'clipboard-read', 'fileSystem' ]);
    session.setPermissionCheckHandler((requester, permission, requestingOrigin, details) => allowed.has(permission) && requester === webContents && details.isMainFrame && (appURI.protocol === 'file:' || CheckOrigin(requestingOrigin, appURI)));
    session.setPermissionRequestHandler((requester, permission, callback, details) => callback(allowed.has(permission) && requester === webContents && details.isMainFrame && CheckTrustedURL(details.requestingUrl, appURI)));
    // TODO: May remove the following workaround when https://github.com/electron/electron/issues/41957 is solved
    session.on('file-system-access-restricted', (_event, details, callback) => callback(CheckOrigin(details.origin, appURI) ? 'allow' : 'deny'));
}

function RestrictNavigation(webContents: Electron.WebContents, appURI: URL): void {
    const preventUntrustedNavigation = (event: Electron.Event, url: string) => {
        if(!CheckTrustedURL(url, appURI)) event.preventDefault();
    };
    webContents.on('will-navigate', preventUntrustedNavigation);
    webContents.on('will-redirect', preventUntrustedNavigation);
    webContents.setWindowOpenHandler(({ url }) => {
        try {
            if(/^https?:$/i.test(new URL(url).protocol)) void shell.openExternal(url);
        } catch { /* DENY */ }
        return { action: 'deny' };
    });
}

function ResolveAppURI(value: string): URL {
    try {
        return new URL(value);
    } catch {
        return pathToFileURL(path.resolve(app.getAppPath(), value));
    }
}

async function OpenWindow(): Promise<void> {
    try {
        InitializeMenu();
        const argv = ParseCLI();
        const manifest = await LoadManifest();
        const uri = ResolveAppURI(argv.origin ?? manifest.url ?? 'about:blank');
        await SetupUserDataDirectory(manifest);
        app.userAgentFallback = manifest['user-agent'] ?? app.userAgentFallback.split(/\s+/).filter(segment => !/(hakuneko|electron)/i.test(segment)).join(' ');
        await app.whenReady();
        const win = await CreateApplicationWindow();
        RestrictNavigation(win.webContents, uri);
        const ipc = new IPC(win.webContents, uri);
        const rpc = new RPCServer('/hakuneko', new RemoteProcedureCallContract(ipc, win.webContents));
        UpdatePermissions(win.webContents.session, win.webContents, uri);
        new RemoteProcedureCallManager(rpc, ipc);
        new FetchProvider(ipc, win.webContents);
        new RemoteBrowserWindowController(ipc);
        new BloatGuard(ipc, win.webContents);
        new PortableStorage(ipc, argv.portableRoot ?? path.dirname(app.getPath('exe')));
        win.RegisterChannels(ipc);
        await win.loadURL(uri.href).catch(error => console.warn(error));
    } catch(error) {
        console.error(error);
        app.quit();
    }
}

OpenWindow();
