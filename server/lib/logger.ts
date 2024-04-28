import { getTime } from "./util";

export class Logger {
    constructor(public filename: string) {}

    log(message: string) {
        console.log('[' + (getTime() / 1000).toFixed(3) + '] [' + this.filename + ']: ' + message);
    }

    warn(message: string) {
        this.log('[WARNING] ' + message);
    }
}