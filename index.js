const Websocket = require("ws");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
require('dotenv').config();

const PORT = process.env.PORT;

const httpServer = http.createServer();
const wss = new Websocket.Server({ server: httpServer });
const app = express();

app.get('/test', (req, res) => {
    res.send("Hello from server!");
})

let waiting;
const lobbies = {};

wss.on('connection', ws => {
    ws.on('error', e => console.log('Websocket Error', e))
    ws.on('message', function incoming(message) {
        let json;
        // console.log(message.toString());
        try {
            json = JSON.parse(message);
        } catch {
            ws.send('{"error": "Invalid JSON"}')
            return;
        }
        if (!json.action) {
            ws.send('{"error":"json must contain action"}')
        }
        let lobby, response;
        switch (json.action) {
            case "create":
                createLobby(json.id, ws);
                break;
            case "score":
                playerScore(json.id, ws);
                break;
            case "sharkWin":
                lobby = lobbies[json.id];
                if (!lobby) {
                    // TODO: tell them lobby DNE
                    return;
                };
                response = JSON.stringify({
                    action: 'sharkWin'
                });
                lobby.player1.ws.send(response);
                lobby.player2.ws.send(response);
                break;
            case "fishWin":
                lobby = lobbies[json.id];
                if (!lobby) {
                    // TODO: tell them lobby DNE
                    return;
                };
                response = JSON.stringify({
                    action: 'fishWin'
                });
                lobby.player1.ws.send(response);
                lobby.player2.ws.send(response);
                break;
                break;
            case "broadcast":
                for (let c of wss.clients) {
                    c.send(JSON.stringify({"action":"Hello!"}));
                }
                break;
            case "coords":
                const id = json.id;
                lobby = lobbies[id];
                if (!lobby) {
                    // TODO: tell them lobby DNE
                    return
                };
                if (lobby.player1.ws === ws) {
                    lobby.player2.ws.send(JSON.stringify({action: "coords", coords: json.coords}));
                } else {
                    lobby.player1.ws.send(JSON.stringify({action: "coords", coords: json.coords}));
                }
                break;
            default:
                ws.send(`{"error":"action \\"${json.action}\\" not recognized"}`)
        }
        
    });

    ws.send(`{"action": "connected"}`);

    ws.on('close', () => {
        if (ws == waiting?.ws) {
            waiting = null;
        } else {
            for (i in lobbies) {
                if (lobbies[i].player1.ws === ws) {
                    lobbies[i].player2.ws.send(`{"action": "otherDisconnect"}`);
                    delete lobbies[i];
                    return;
                } else if (lobbies[i].player2.ws === ws) {
                    lobbies[i].player1.ws.send(`{"action": "otherDisconnect"}`);
                    delete lobbies[i];
                    return;
                }
            }
        }
    })

    
});

function createLobby(id, ws) {
    if (waiting) {
        const lobby = {
            player1: waiting,
            player2: {
                ws: ws,
                id: id,
                position: [0,0,0]
            }, 
            seed: crypto.randomBytes(4).readUInt32BE(0, true),
            score: 0
        };
        lobbies[lobby.seed] = lobby;
        const obj = {
            action: "start",
            seed: lobby.seed,
        }
        lobby.player1.ws.send(JSON.stringify({...obj, id: 0}));
        ws.send(JSON.stringify({...obj, id: 1}));
        waiting = null;
    } else {
        waiting = {
            ws,
            id,
            position: [0,0,0]
        }
        ws.send(`{"action": "wait"}`)
    }
}

function playerScore(id, ws) {
    const lobby = lobbies[id];
    if (!lobby) return; // TODO: tell them lobby doesn't exist
    lobby.score++;
    if (lobby.score >= 10) {
        // send fish win condition
        lobby.player1.ws.send(JSON.stringify({
            action:"fishWin"
        }))
    }
}

httpServer.on("request", app);

httpServer.listen(PORT, () => {
  console.log(`Express listening on port ${PORT}`);
});
