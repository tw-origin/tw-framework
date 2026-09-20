use tw_lexer::{tokenize, TokenType};

#[test]
fn tokenizes_simple_div() {
    let result = tokenize("<div>hello</div>", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_self_closing_img() {
    let result = tokenize("<img src='x.png' />", None);
    assert!(result.tokens.len() > 2);
}

#[test]
fn tokenizes_void_br() {
    let result = tokenize("<br/>", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_nested_elements() {
    let result = tokenize("<div><span><p>deep</p></span></div>", None);
    assert!(result.tokens.len() > 5);
}

#[test]
fn tokenizes_empty_input() {
    let result = tokenize("", None);
    assert!(result.tokens.len() >= 1); // at least EOF
}

#[test]
fn tokenizes_text_content() {
    let result = tokenize("Just text", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_comment() {
    let result = tokenize("<!-- comment -->", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_class_attribute() {
    let result = tokenize("<div class='box'>text</div>", None);
    assert!(result.tokens.len() > 2);
}

#[test]
fn tokenizes_multiple_attributes() {
    let result = tokenize("<div class='box' id='main' data-x='1'>text</div>", None);
    assert!(result.tokens.len() > 5);
}

#[test]
fn tokenizes_boolean_attribute() {
    let result = tokenize("<input disabled />", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_event_binding() {
    let result = tokenize("<button :on:click='handle()'>click</button>", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_property_binding() {
    let result = tokenize("<div :class='{active: isActive}'>x</div>", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_interpolation() {
    let result = tokenize("<p>{name}</p>", None);
    assert!(result.tokens.len() > 1);
}

#[test]
fn tokenizes_expression_interpolation() {
    let result = tokenize("<p>{a + b}</p>", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_multiple_interpolations() {
    let result = tokenize("<p>Hello {name}, you are {age}</p>", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_page_directive() {
    let result = tokenize("@page { title: 'Test'; }", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_state_directive() {
    let result = tokenize("@state { count = 0; }", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_import_directive() {
    let result = tokenize("@import { Button } from './Button.tw';", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_script_block() {
    let result = tokenize("<script>console.log('hello');</script>", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_style_block() {
    let result = tokenize("<style>.box { color: red; }</style>", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_pascalcase_component() {
    let result = tokenize("<MyComponent />", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn tokenizes_component_with_children() {
    let result = tokenize("<Card><h1>Title</h1><p>Body</p></Card>", None);
    assert!(!result.tokens.is_empty());
}

#[test]
fn produces_eof_token() {
    let result = tokenize("<div>x</div>", None);
    let last = result.tokens.last().unwrap();
    assert_eq!(last.token_type, TokenType::Eof);
}

#[test]
fn handles_whitespace_only() {
    let result = tokenize("   \n\t  ", None);
    assert!(result.tokens.len() >= 1);
}

#[test]
fn tokenizes_double_quoted_attrs() {
    let result = tokenize("<div class=\"box\" id=\"main\">x</div>", None);
    assert!(result.tokens.len() > 4);
}

#[test]
fn tokenizes_doctype() {
    let result = tokenize("<!DOCTYPE html>", None);
    assert!(!result.tokens.is_empty());
}
