declare var ipcRenderer: {
    invoke<T extends void | JSONElement>(channel: string, ...parameters: JSONArray): Promise<T>;
    on(channel: string, callback: (...parameters: JSONArray) => void): void;
};
