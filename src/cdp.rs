//! Chrome DevTools protocol over the local WebSocket.

use crate::jsonutil::{self, Json};
use crate::ws::WebSocket;

pub struct Cdp {
    ws: WebSocket,
    next_id: i64,
}

impl Cdp {
    pub fn connect(port: u16, path: &str) -> Result<Self, String> {
        Ok(Self {
            ws: WebSocket::connect("127.0.0.1", port, path)?,
            next_id: 1,
        })
    }

    pub fn call(
        &mut self,
        method: &str,
        params: Json,
        session: Option<&str>,
    ) -> Result<Json, String> {
        let id = self.next_id;
        self.next_id += 1;
        let mut pairs = vec![
            ("id".into(), Json::Number(id as f64)),
            ("method".into(), Json::String(method.to_string())),
            ("params".into(), params),
        ];
        if let Some(session) = session {
            pairs.push(("sessionId".into(), Json::String(session.to_string())));
        }
        self.ws
            .send_text(&jsonutil::to_string(&Json::Object(pairs)))?;
        for _ in 0..8_000 {
            let text = self.ws.recv_text()?;
            let json = jsonutil::from_str(&text).map_err(|err| format!("cdp json: {err}"))?;
            if json.get("id").and_then(|v| v.as_i64()) != Some(id) {
                continue;
            }
            if let Some(err) = json.get("error") {
                return Err(jsonutil::to_string(err));
            }
            return Ok(json.get("result").cloned().unwrap_or(Json::Null));
        }
        Err(format!("no result for {method}"))
    }
}
