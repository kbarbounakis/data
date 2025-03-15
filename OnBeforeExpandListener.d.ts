import { BeforeExecuteEventListener, DataEventArgs } from "./types";

export declare class OnBeforeExpandListener implements BeforeExecuteEventListener {
    beforeExecute(event: DataEventArgs, callback: (err?: Error) => void): void;
}