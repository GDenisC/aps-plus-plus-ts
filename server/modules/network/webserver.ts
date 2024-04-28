import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { connectSocket } from './sockets';
import config from '../../config';
import global, { Logger } from '../global';

const publicRoot   = path.resolve('./public'),
        sharedRoot = path.resolve('./shared');

const logger = new Logger('webserver.ts');
const mimeSet: Record<string, string> = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'text/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'svg': 'image/svg+xml',
    'ttf': 'application/x-font-ttf',
    'otf': 'application/x-font-opentype',
    'ico': 'image/x-icon',
    'md': 'text/markdown',
    'txt': 'text/plain'
}

if (config.host === 'localhost') {
    logger.warn(`config.host is just "localhost", are you sure you don't mean "localhost:${config.port}"?`);
}
if (config.host.match(/localhost:(\d)/) && config.host !== 'localhost:' + config.port) {
    logger.warn('config.host is a localhost domain but its port is different to config.port!');
}

const wss = new WebSocketServer({ noServer: true });
const httpServer = createServer((req, res) => {
    let url = req.url as string,
        resStr = "";
    if (url.startsWith('/shared/')) {
        let fileToGet = path.join(sharedRoot, url.slice(7));

        if (!fs.existsSync(fileToGet)) {
            fileToGet = path.join(sharedRoot, config.DEFAULT_FILE);
        } else if (!fs.lstatSync(fileToGet).isFile()) {
            fileToGet = path.join(sharedRoot, config.DEFAULT_FILE);
        }

        res.writeHead(200, { 'Content-Type': mimeSet[fileToGet.split('.').pop()!] || 'text/html'});
        return fs.createReadStream(fileToGet).pipe(res);
    } else switch (req.url) {
        case "/lib/json/mockups.json":
            resStr = global.mockupJsonData ?? '{}';
            break;
        case "/lib/json/gamemodeData.json":
            resStr = JSON.stringify({ gameMode: config.gameModeName, players: global.views.length });
            break;
        case "/serverData.json":
            resStr = JSON.stringify({ ip: config.host });
            break;
        default:
            let fileToGet = path.join(publicRoot, url);

            if (!fs.existsSync(fileToGet)) {
                fileToGet = path.join(publicRoot, config.DEFAULT_FILE);
            } else if (!fs.lstatSync(fileToGet).isFile()) {
                fileToGet = path.join(publicRoot, config.DEFAULT_FILE);
            }

            res.writeHead(200, { 'Content-Type': mimeSet[fileToGet.split('.').pop()!] || 'text/html'});
            return fs.createReadStream(fileToGet).pipe(res);
    }
    res.writeHead(200);
    res.end(resStr);
});

httpServer.on('upgrade', (request, socket, head) =>
    wss.handleUpgrade(request, socket, head, ws =>
        connectSocket(ws as any, request)
    )
);

httpServer.listen(config.port, () => {
    console.log(`Server is listening on http://localhost:${config.port}`);
})