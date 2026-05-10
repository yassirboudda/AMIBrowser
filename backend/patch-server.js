// Patch script — run once to add session routes + WebSocket to server.js
const fs = require('fs');
const file = '/opt/autoapply-backend/src/server.js';
let src = fs.readFileSync(file, 'utf8');

// 1. Add imports after amiRoutes
if (!src.includes('sessionRoutes')) {
  src = src.replace(
    'const amiRoutes = require("./routes/ami");',
    'const amiRoutes = require("./routes/ami");\nconst sessionRoutes = require("./routes/session");\nconst { WebSocketServer } = require("ws");\nconst http = require("http");\nconst { resolveUser } = require("./middleware/auth");'
  );
}

// 2. Add session routes mount after ami routes
if (!src.includes('/api/session')) {
  src = src.replace(
    'app.use("/api/ami", amiRoutes);',
    'app.use("/api/ami", amiRoutes);\napp.use("/api/session", sessionRoutes);'
  );
}

// 3. Replace app.listen with http server + WebSocket
if (!src.includes('httpServer')) {
  src = src.replace(
    `  app.listen(PORT, () => {
    console.log(\`\\n🚀 AutoApply V2 Backend v4.0.0\`);
    console.log(\`   Running on http://localhost:\${PORT}\`);
    console.log(\`   API docs: http://localhost:\${PORT}/api/health\\n\`);
  });`,
    `  const httpServer = http.createServer(app);

  // WebSocket server for browser session streaming
  const wss = new WebSocketServer({ noServer: true });
  sessionRoutes.handleWebSocketUpgrade(wss, resolveUser);

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url.includes("/api/session/") && req.url.includes("/stream")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(PORT, () => {
    console.log(\`\\n🚀 AutoApply V2 Backend v4.0.0\`);
    console.log(\`   Running on http://localhost:\${PORT}\`);
    console.log(\`   WebSocket: ws://localhost:\${PORT}/api/session/:id/stream\`);
    console.log(\`   API docs: http://localhost:\${PORT}/api/health\\n\`);
  });`
  );
}

fs.writeFileSync(file, src);
console.log('server.js patched successfully');
