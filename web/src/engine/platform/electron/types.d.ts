declare var ipcRenderer: {
    invoke<T extends void | JSONElement>(channel: string, ...parameters: JSONArray): Promise<T>;
    on(channel: string, callback: (...parameters: JSONArray) => void): void;
};

declare var portableStorage: {
    writeFile(segments: string[], data: ArrayBuffer): Promise<void>;
};
