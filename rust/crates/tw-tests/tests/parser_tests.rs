use tw_parser::{parse, is_element, is_text, is_component, is_if_node, is_for_node, is_script_block, is_style_block};
use tw_parser::ast::*;

#[test]
fn parses_single_element() {
    let program = parse("<div>hello</div>");
    assert_eq!(program.body.len(), 1);
    assert!(is_element(&program.body[0]));
}

#[test]
fn parses_text_content() {
    let program = parse("<p>Hello World</p>");
    assert_eq!(program.body.len(), 1);
}

#[test]
fn parses_self_closing_tag() {
    let program = parse("<br />");
    assert_eq!(program.body.len(), 1);
}

#[test]
fn parses_multiple_root_elements() {
    let program = parse("<div>a</div><div>b</div>");
    assert_eq!(program.body.len(), 2);
}

#[test]
fn parses_nested_elements() {
    let program = parse("<div><span><p>deep</p></span></div>");
    assert!(is_element(&program.body[0]));
}

#[test]
fn parses_empty_element() {
    let program = parse("<div></div>");
    assert!(is_element(&program.body[0]));
}

#[test]
fn parses_multiple_attributes() {
    let program = parse("<div class='box' id='main' data-x='1'>x</div>");
    if let Node::Element(el) = &program.body[0] {
        assert_eq!(el.attrs.len(), 3);
    }
}

#[test]
fn parses_boolean_attribute() {
    let program = parse("<input disabled />");
    assert!(is_element(&program.body[0]));
}

#[test]
fn parses_event_binding() {
    let program = parse("<button :on:click='handle()'>x</button>");
    if let Node::Element(el) = &program.body[0] {
        assert!(!el.events.is_empty());
    }
}

#[test]
fn parses_property_binding() {
    let program = parse("<div :class='{active: isActive}'>x</div>");
    if let Node::Element(el) = &program.body[0] {
        assert!(!el.bindings.is_empty());
    }
}

#[test]
fn parses_component() {
    let program = parse("<MyComponent />");
    assert!(is_component(&program.body[0]));
}

#[test]
fn parses_component_with_props() {
    let program = parse("<Button label='Click' color='blue' />");
    assert!(is_component(&program.body[0]));
}

#[test]
fn parses_component_with_children() {
    let program = parse("<Card><h1>Title</h1></Card>");
    assert!(is_component(&program.body[0]));
}

#[test]
fn distinguishes_component_from_element() {
    let program = parse("<div></div><MyComp />");
    assert!(is_element(&program.body[0]));
    assert!(is_component(&program.body[1]));
}

#[test]
fn parses_page_directive() {
    let program = parse("@page { title: 'Test'; }");
    assert!(program.directives.len() > 0);
}

#[test]
fn parses_state_directive() {
    let program = parse("@state { count = 0; }");
    assert!(program.directives.len() > 0);
}

#[test]
fn parses_import_directive() {
    let program = parse("@import { Button } from './Button.tw';");
    assert!(program.directives.len() > 0);
}

#[test]
fn parses_multiple_directives() {
    let program = parse("@page { title: 'Test'; } @state { count = 0; } <div>x</div>");
    assert_eq!(program.directives.len(), 2);
    assert_eq!(program.body.len(), 1);
}

#[test]
fn parses_script_block() {
    let program = parse("<script>console.log('x');</script>");
    assert!(is_script_block(&program.body[0]));
}

#[test]
fn parses_style_block() {
    let program = parse("<style>.box { color: red; }</style>");
    assert!(is_style_block(&program.body[0]));
}

#[test]
fn parses_scoped_style() {
    let program = parse("<style scoped>.x { color: red; }</style>");
    if let Node::StyleBlock(style) = &program.body[0] {
        assert!(style.scoped);
    }
}

#[test]
fn parses_interpolation() {
    let program = parse("<p>Hello {name}</p>");
    if let Node::Element(el) = &program.body[0] {
        assert!(el.children.iter().any(|c| matches!(c, Node::Interpolation(_))));
    }
}

#[test]
fn handles_unclosed_tag_gracefully() {
    let program = parse("<div>unclosed");
    assert!(program.body.len() >= 1);
}

#[test]
fn parses_empty_input() {
    let program = parse("");
    assert!(program.body.is_empty());
}
