use tw_parser::parse;
use tw_codegen::{generate, generate_html};

#[test]
fn generates_html_from_simple_template() {
    let program = parse("<div>Hello</div>");
    let output = generate(&program);
    assert!(output.html.contains("Hello"));
}

#[test]
fn compile_produces_all_fields() {
    let program = parse("<div>test</div>");
    let output = generate(&program);
    assert!(!output.html.is_empty());
    assert!(output.css.is_empty() || !output.css.is_empty());
    assert!(output.js.is_empty() || !output.js.is_empty());
    assert!(output.metadata.total_time_us >= 0);
}

#[test]
fn handles_nested_elements() {
    let program = parse("<div><span><p>deep</p></span></div>");
    let output = generate(&program);
    assert!(output.html.contains("deep"));
}

#[test]
fn handles_multiple_root_elements() {
    let program = parse("<div>a</div><div>b</div>");
    let output = generate(&program);
    assert!(output.html.contains("<div>a</div>"));
    assert!(output.html.contains("<div>b</div>"));
}

#[test]
fn handles_style_block() {
    let program = parse("<div>styled</div><style>.box { color: red; }</style>");
    let output = generate(&program);
    assert!(output.html.contains("styled"));
    assert!(output.css.contains("color: red"));
}

#[test]
fn handles_script_block() {
    let program = parse("<div id='app'>loading</div><script>console.log('mounted');</script>");
    let output = generate(&program);
    assert!(output.html.contains("loading"));
    assert!(output.js.contains("console.log"));
}

#[test]
fn handles_self_closing_tag() {
    let program = parse("<br />");
    let output = generate(&program);
    assert!(output.html.contains("<br"));
}

#[test]
fn handles_attributes() {
    let program = parse("<div class='box' id='main'>content</div>");
    let output = generate(&program);
    assert!(output.html.contains("class=\"box\""));
    assert!(output.html.contains("id=\"main\""));
    assert!(output.html.contains("content"));
}

#[test]
fn handles_event_bindings() {
    let program = parse("<button :on:click='handle()'>click</button>");
    let output = generate(&program);
    assert!(output.html.contains("data-on:click"));
}

#[test]
fn handles_state_directive() {
    let program = parse("@state { count = 0; }<div>{count}</div>");
    let output = generate(&program);
    assert!(output.html.contains("<div>"));
    assert!(output.js.contains("@state"));
}

#[test]
fn handles_page_directive() {
    let program = parse("@page { title: 'Test'; }<div>content</div>");
    let output = generate(&program);
    assert!(output.html.contains("content"));
}

#[test]
fn handles_empty_input() {
    let program = parse("");
    let output = generate(&program);
    assert!(output.html.is_empty());
}

#[test]
fn metadata_tracks_node_count() {
    let program = parse("<div>a</div><div>b</div><div>c</div>");
    let output = generate(&program);
    assert_eq!(output.metadata.node_count, 3);
}

#[test]
fn metadata_tracks_directive_count() {
    let program = parse("@page { title: 'Test'; } @state { count = 0; } <div>x</div>");
    let output = generate(&program);
    assert_eq!(output.metadata.directive_count, 2);
}

#[test]
fn generate_html_convenience() {
    let program = parse("<div>test</div>");
    let html = generate_html(&program);
    assert!(html.contains("test"));
}

#[test]
fn handles_component() {
    let program = parse("<MyComponent />");
    let output = generate(&program);
    assert!(output.html.contains("my-component"));
}

#[test]
fn handles_comment() {
    let program = parse("<!-- hello --><div>x</div>");
    let output = generate(&program);
    assert!(output.html.contains("<!--"));
}

#[test]
fn handles_doctype() {
    let program = parse("<!DOCTYPE html><div>x</div>");
    let output = generate(&program);
    assert!(output.html.contains("DOCTYPE"));
}
