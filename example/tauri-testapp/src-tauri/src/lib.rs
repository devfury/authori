use std::{
    io::{BufRead, BufReader, Write},
    net::{TcpListener, TcpStream},
    thread,
};

const CALLBACK_BRIDGE_ADDRESS: &str = "127.0.0.1:5174";
const CALLBACK_BRIDGE_PATH: &str = "/oauth/callback";
const APP_DEEP_LINK_CALLBACK_URL: &str = "authori://oauth/callback";

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn callback_bridge_response(target: &str) -> String {
    let callback_url = format!("{APP_DEEP_LINK_CALLBACK_URL}{target}");
    let escaped_callback_url = html_escape(&callback_url);

    format!(
        "<!doctype html>
<html lang=\"ko\">
  <head>
    <meta charset=\"utf-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
    <title>Authori Callback Bridge</title>
    <style>
      :root {{
        color-scheme: dark;
        font-family: 'Segoe UI', 'Noto Sans KR', system-ui, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }}
      body {{
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 28%),
          radial-gradient(circle at top right, rgba(249, 115, 22, 0.16), transparent 24%),
          linear-gradient(180deg, #111827 0%, #020617 100%);
      }}
      main {{
        width: min(100%, 540px);
        border: 1px solid rgba(148, 163, 184, 0.24);
        border-radius: 24px;
        padding: 28px;
        background: rgba(15, 23, 42, 0.88);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.45);
      }}
      h1 {{ margin: 0 0 12px; font-size: 1.5rem; }}
      p {{ margin: 0 0 12px; line-height: 1.6; color: rgba(226, 232, 240, 0.82); }}
      code {{
        display: block;
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(30, 41, 59, 0.8);
        color: #f8fafc;
        overflow-wrap: anywhere;
      }}
      a {{ color: #7dd3fc; }}
    </style>
  </head>
  <body>
    <main>
      <h1>앱으로 돌아가는 중입니다…</h1>
      <p>브라우저 인증이 끝나면 Authori Tauri 테스트 앱으로 다시 전달됩니다.</p>
      <p>자동 이동이 되지 않으면 아래 링크를 눌러 주세요.</p>
      <p><a href=\"{escaped_callback_url}\">앱으로 돌아가기</a></p>
      <code>{escaped_callback_url}</code>
    </main>
    <script>
      window.location.replace({escaped_callback_url:?});
    </script>
  </body>
</html>"
    )
}

fn handle_bridge_connection(mut stream: TcpStream) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or("/");

    let (status_line, content_type, body) =
        if method == "GET" && target.starts_with(CALLBACK_BRIDGE_PATH) {
            (
                "HTTP/1.1 200 OK",
                "text/html; charset=utf-8",
                callback_bridge_response(target.trim_start_matches(CALLBACK_BRIDGE_PATH)),
            )
        } else {
            (
                "HTTP/1.1 404 Not Found",
                "text/plain; charset=utf-8",
                "Not Found".to_string(),
            )
        };

    write!(
        stream,
        "{status_line}\r\nContent-Type: {content_type}\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    stream.flush()
}

fn spawn_callback_bridge_server() -> std::io::Result<()> {
    let listener = TcpListener::bind(CALLBACK_BRIDGE_ADDRESS)?;

    thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    if let Err(error) = handle_bridge_connection(stream) {
                        eprintln!("callback bridge connection failed: {error}");
                    }
                }
                Err(error) => {
                    eprintln!("callback bridge accept failed: {error}");
                }
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        use tauri::Manager;

        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }

            spawn_callback_bridge_server()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
