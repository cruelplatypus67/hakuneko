class PortableFileHandle {
    public readonly kind = 'file';

    constructor(public readonly name: string, private readonly segments: string[]) {}

    public async createWritable(): Promise<FileSystemWritableFileStream> {
        // ponytail: buffers one output file; use MessagePort streaming if archive sizes become a problem.
        const chunks: BlobPart[] = [];
        return {
            write: async(data: BlobPart) => { chunks.push(data); },
            close: async() => globalThis.portableStorage.writeFile(this.segments, await new Blob(chunks).arrayBuffer()),
        } as FileSystemWritableFileStream;
    }
}

class PortableDirectoryHandle {
    public readonly kind = 'directory';

    constructor(public readonly name: string, private readonly segments: string[] = []) {}

    public queryPermission(): Promise<PermissionState> {
        return Promise.resolve('granted');
    }

    public requestPermission(): Promise<PermissionState> {
        return Promise.resolve('granted');
    }

    public getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle> {
        return Promise.resolve(new PortableDirectoryHandle(name, [...this.segments, name]) as unknown as FileSystemDirectoryHandle);
    }

    public getFileHandle(name: string): Promise<FileSystemFileHandle> {
        return Promise.resolve(new PortableFileHandle(name, [...this.segments, name]) as unknown as FileSystemFileHandle);
    }
}

export function GetPortableDownloadDirectory(): FileSystemDirectoryHandle {
    return new PortableDirectoryHandle('downloads') as unknown as FileSystemDirectoryHandle;
}
