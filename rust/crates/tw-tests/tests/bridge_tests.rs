use tw_bridge::{compile, compile_to_html, count_tokens};

#[test]
fn compile_returns_html() {
    let response = compile("<div>Hello</div>", None);
    assert!(response.html.contains("Hello"));
}

#[test]
fn compile_returns_css() {
    let response = compile("<div>styled</div><style>.box { color: red; }</style>", None);
    assert!(response.css.contains("color: red"));
}

#[test]
fn compile_returns_js() {
    let response = compile("<div id='app'>x</div><script>console.log('hi');</script>", None);
    assert!(response.js.contains("console.log"));
}

#[test]
fn compile_returns_metadata() {
    let response = compile("<div>test</div>", None);
    assert!(response.metadata.total_time_us >= 0);
    assert_eq!(response.metadata.node_count, 1);
}

#[test]
fn compile_with_file_path() {
    let response = compile("<div>test</div>", Some("test.tw"));
    assert!(response.html.contains("test"));
}

#[test]
fn compile_to_html_works() {
    let html = compile_to_html("<div>Hello</div>");
    assert!(html.contains("Hello"));
}

#[test]
fn count_tokens_works() {
    let count = count_tokens("<div>hello</div>");
    assert!(count > 0);
}

#[test]
fn compile_handles_empty() {
    let response = compile("", None);
    assert!(response.html.is_empty());
}

#[test]
fn compile_handles_directives() {
    let response = compile("@page { title: 'Test'; } @state { count = 0; } <div>x</div>", None);
    assert!(response.html.contains("x"));
    assert_eq!(response.metadata.directive_count, 2);
}

#[test]
fn compile_handles_nested() {
    let response = compile("<div><span><p>deep</p></span></div>", None);
    assert!(response.html.contains("deep"));
}

#[test]
fn compile_handles_attributes() {
    let response = compile("<div class='box' id='main'>content</div>", None);
    assert!(response.html.contains("class=\"box\""));
    assert!(response.html.contains("id=\"main\""));
}

#[test]
fn compile_handles_component() {
    let response = compile("<MyComponent />", None);
    assert!(response.html.contains("my-component"));
}
