//! A minimal WebSocket client for Chrome's DevTools socket. Localhost only.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use crate::base64util;
use crate::sha1;
use crate::state::random_hex;

const GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_FRAME: usize = 16 * 1024 * 1024;

pub struct WebSocket {
    stream: TcpStream,
}

impl WebSocket {
    pub fn connect(host: &str, port: u16, path: &str) -> Result<Self, String> {
        let mut stream = TcpStream::connect((host, port)).map_err(|err| err.to_string())?;
        stream
            .set_read_timeout(Some(Duration::from_secs(30)))
            .map_err(|err| err.to_string())?;
        stream
            .set_write_timeout(Some(Duration::from_secs(15)))
            .map_err(|err| err.to_string())?;
        let key_raw = random_hex(8);
        let key = base64util::encode(key_raw.as_bytes());
        let path = if path.starts_with('/') {
            path.to_string()
        } else {
            format!("/{path}")
        };
        let req = format!(
            "GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\nOrigin: http://{host}:{port}\r\n\r\n"
        );
        stream
            .write_all(req.as_bytes())
            .map_err(|err| err.to_string())?;
        let header = read_header(&mut stream)?;
        let first = header.lines().next().unwrap_or("");
        if !first.contains("101") {
            return Err(format!("websocket upgrade failed: {first}"));
        }
        let expect = accept_key(&key);
        let ok = header.lines().any(|line| {
            let (name, value) = line.split_once(':').unwrap_or(("", ""));
            name.eq_ignore_ascii_case("Sec-WebSocket-Accept") && value.trim() == expect
        });
        if !ok {
            return Err("websocket accept key did not match".into());
        }
        Ok(WebSocket { stream })
    }

    pub fn send_text(&mut self, text: &str) -> Result<(), String> {
        self.send_frame(0x1, text.as_bytes())
    }

    pub fn recv_text(&mut self) -> Result<String, String> {
        let mut acc = Vec::new();
        loop {
            let (fin, opcode, payload) = self.read_frame()?;
            match opcode {
                0x1 | 0x0 => {
                    acc.extend_from_slice(&payload);
                    if fin {
                        return String::from_utf8(acc)
                            .map_err(|_| "websocket text was not utf-8".into());
                    }
                }
                0x8 => return Err("websocket closed".into()),
                0x9 => self.send_frame(0xA, &payload)?,
                0xA => {}
                other => return Err(format!("websocket opcode {other}")),
            }
            if acc.len() > MAX_FRAME {
                return Err("websocket message too large".into());
            }
        }
    }

    fn send_frame(&mut self, opcode: u8, payload: &[u8]) -> Result<(), String> {
        let mask: [u8; 4] = random_hex(2).as_bytes()[..4]
            .try_into()
            .unwrap_or([1, 2, 3, 4]);
        let mut header = Vec::new();
        header.push(0x80 | opcode);
        let len = payload.len();
        if len < 126 {
            header.push(0x80 | len as u8);
        } else if len <= u16::MAX as usize {
            header.push(0x80 | 126);
            header.extend_from_slice(&(len as u16).to_be_bytes());
        } else {
            header.push(0x80 | 127);
            header.extend_from_slice(&(len as u64).to_be_bytes());
        }
        header.extend_from_slice(&mask);
        self.stream
            .write_all(&header)
            .map_err(|err| err.to_string())?;
        let masked: Vec<u8> = payload
            .iter()
            .enumerate()
            .map(|(i, b)| b ^ mask[i % 4])
            .collect();
        self.stream
            .write_all(&masked)
            .map_err(|err| err.to_string())?;
        self.stream.flush().map_err(|err| err.to_string())
    }

    fn read_frame(&mut self) -> Result<(bool, u8, Vec<u8>), String> {
        let mut head = [0u8; 2];
        self.read_exact(&mut head)?;
        let fin = head[0] & 0x80 != 0;
        let opcode = head[0] & 0x0f;
        let masked = head[1] & 0x80 != 0;
        let mut len = (head[1] & 0x7f) as u64;
        if len == 126 {
            let mut ext = [0u8; 2];
            self.read_exact(&mut ext)?;
            len = u16::from_be_bytes(ext) as u64;
        } else if len == 127 {
            let mut ext = [0u8; 8];
            self.read_exact(&mut ext)?;
            len = u64::from_be_bytes(ext);
        }
        if len as usize > MAX_FRAME {
            return Err("websocket frame too large".into());
        }
        let mut mask = [0u8; 4];
        if masked {
            self.read_exact(&mut mask)?;
        }
        let mut payload = vec![0u8; len as usize];
        if len > 0 {
            self.read_exact(&mut payload)?;
        }
        if masked {
            for (i, byte) in payload.iter_mut().enumerate() {
                *byte ^= mask[i % 4];
            }
        }
        Ok((fin, opcode, payload))
    }

    fn read_exact(&mut self, buf: &mut [u8]) -> Result<(), String> {
        self.stream.read_exact(buf).map_err(|err| err.to_string())
    }
}

fn accept_key(client_key: &str) -> String {
    let mut material = client_key.as_bytes().to_vec();
    material.extend_from_slice(GUID.as_bytes());
    base64util::encode(&sha1::digest(&material))
}

fn read_header(stream: &mut TcpStream) -> Result<String, String> {
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    while buf.len() < 8192 {
        stream
            .read_exact(&mut byte)
            .map_err(|err| err.to_string())?;
        buf.push(byte[0]);
        if buf.ends_with(b"\r\n\r\n") {
            return String::from_utf8(buf).map_err(|_| "header".into());
        }
    }
    Err("websocket header too long".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn frames_a_roundtrip() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (mut sock, _) = listener.accept().unwrap();
            let mut buf = Vec::new();
            let mut byte = [0u8; 1];
            while !buf.ends_with(b"\r\n\r\n") {
                sock.read_exact(&mut byte).unwrap();
                buf.push(byte[0]);
            }
            let text = String::from_utf8(buf).unwrap();
            let key = text
                .lines()
                .find(|l| l.to_ascii_lowercase().starts_with("sec-websocket-key:"))
                .unwrap()
                .split_once(':')
                .unwrap()
                .1
                .trim();
            let accept = accept_key(key);
            let resp = format!(
                "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"
            );
            sock.write_all(resp.as_bytes()).unwrap();
            // Read one client frame and echo its payload as an unmasked text frame.
            let mut head = [0u8; 2];
            sock.read_exact(&mut head).unwrap();
            let len = (head[1] & 0x7f) as usize;
            let mut mask = [0u8; 4];
            sock.read_exact(&mut mask).unwrap();
            let mut payload = vec![0u8; len];
            sock.read_exact(&mut payload).unwrap();
            for (i, b) in payload.iter_mut().enumerate() {
                *b ^= mask[i % 4];
            }
            let mut frame = vec![0x81, payload.len() as u8];
            frame.extend_from_slice(&payload);
            sock.write_all(&frame).unwrap();
        });
        let mut ws = WebSocket::connect("127.0.0.1", port, "/devtools/browser/test").unwrap();
        ws.send_text("{\"id\":1}").unwrap();
        let back = ws.recv_text().unwrap();
        assert_eq!(back, "{\"id\":1}");
        server.join().unwrap();
    }
}
