/// TW parser — converts a token stream into an AST (Program).
/// Handles HTML elements, components, directives, control flow,
/// interpolation, script/style blocks, and error recovery.

use tw_lexer::{tokenize, TokenizerOptions, Token, TokenType, TokenStream};
use crate::ast::*;

#[derive(Debug, Clone)]
pub struct ParseError {
    pub message: String,
    pub line: usize,
    pub col: usize,
}

#[derive(Debug, Clone)]
pub struct ParseResult {
    pub program: Program,
    pub errors: Vec<ParseError>,
    pub warnings: Vec<ParseError>,
}

pub fn parse(source: &str) -> Program {
    parse_with_options(source, None).program
}

pub fn parse_with_options(source: &str, opts: Option<TokenizerOptions>) -> ParseResult {
    let tok_result = tokenize(source, opts);
    let mut stream = TokenStream::new(tok_result.tokens);
    let mut errors: Vec<ParseError> = tok_result.errors.iter().map(|e| ParseError {
        message: e.message.clone(),
        line: e.line,
        col: e.col,
    }).collect();
    let warnings = Vec::new();

    let mut program = Program::default();
    let mut current_directive: Option<DirectiveNode> = None;

    while !stream.is_done() {
        let tok = match stream.peek(0) {
            Some(t) => t.clone(),
            None => break,
        };

        if tok.token_type == TokenType::Eof {
            break;
        }

        // Directives (@page, @state, @import, etc.)
        if tok.token_type == TokenType::At {
            let directive = parse_directive(&mut stream, &mut errors);
            if let Ok(d) = directive {
                program.directives.push(d);
            }
            continue;
        }

        // Directive keyword at top level (e.g. `@page` tokenizes as At + Ident)
        // Also handle: the tokenizer may produce Directive tokens
        if tok.token_type == TokenType::Directive {
            let directive = parse_directive_token(&mut stream, &mut errors);
            if let Ok(d) = directive {
                program.directives.push(d);
            }
            continue;
        }

        // Parse body node
        match parse_node(&mut stream, &mut errors) {
            Some(node) => program.body.push(node),
            None => {
                // Skip unknown token
                stream.advance();
            }
        }
    }

    ParseResult { program, errors, warnings }
}

fn parse_node(stream: &mut TokenStream, errors: &mut Vec<ParseError>) -> Option<Node> {
    let tok = stream.peek(0)?;

    match tok.token_type {
        TokenType::OpenTag => parse_element(stream, errors).map(Node::Element),
        TokenType::ComponentName => parse_component(stream, errors).map(Node::Component),
        TokenType::Text => {
            let tok = stream.advance().unwrap();
            Some(Node::Text(TextNode {
                value: tok.value,
                loc: NodeLocation { start: tok.pos, end: tok.end },
            }))
        }
        TokenType::InterpStart => parse_interpolation(stream, errors).map(Node::Interpolation),
        TokenType::ScriptOpen => parse_script_block(stream, errors).map(Node::ScriptBlock),
        TokenType::StyleOpen => parse_style_block(stream, errors).map(Node::StyleBlock),
        TokenType::Comment => {
            let tok = stream.advance().unwrap();
            Some(Node::Comment(CommentNode {
                content: tok.value,
                loc: NodeLocation { start: tok.pos, end: tok.end },
            }))
        }
        TokenType::Doctype => {
            let tok = stream.advance().unwrap();
            Some(Node::Doctype(DoctypeNode {
                content: tok.value,
                loc: NodeLocation { start: tok.pos, end: tok.end },
            }))
        }
        _ => {
            // Check for control flow keywords
            if tok.token_type == TokenType::Ident || tok.token_type == TokenType::Keyword {
                let name = tok.value.as_str();
                if name == "if" || name == "If" {
                    return parse_if(stream, errors).map(Node::If);
                }
                if name == "for" || name == "For" {
                    return parse_for(stream, errors).map(Node::For);
                }
                if name == "while" || name == "While" {
                    return parse_while(stream, errors).map(Node::While);
                }
            }
            // Check for <if, <for, <while tags (parsed as OpenTag)
            if tok.token_type == TokenType::OpenTag {
                let tag_name = tok.value.as_str();
                if tag_name == "if" || tag_name == "If" {
                    return parse_if_tag(stream, errors).map(Node::If);
                }
                if tag_name == "for" || tag_name == "For" {
                    return parse_for_tag(stream, errors).map(Node::For);
                }
            }
            None
        }
    }
}

fn parse_element(stream: &mut TokenStream, errors: &mut Vec<ParseError>) -> Option<ElementNode> {
    let tag_tok = stream.advance()?;
    let tag = tag_tok.value.clone();
    let start = tag_tok.pos;

    let mut attrs = Vec::new();
    let mut bindings = Vec::new();
    let mut events = Vec::new();
    let mut directives = Vec::new();
    let mut self_closing = false;

    // Parse attributes until > or />
    while !stream.is_done() {
        let tok = match stream.peek(0) {
            Some(t) => t.clone(),
            None => break,
        };

        match tok.token_type {
            TokenType::SelfClose => {
                stream.advance();
                self_closing = true;
                break;
            }
            TokenType::Gt => {
                stream.advance();
                break;
            }
            TokenType::AttrName => {
                let name_tok = stream.advance().unwrap();
                let mut value = None;
                let raw = name_tok.value.clone();

                // Check for = value
                if let Some(next) = stream.peek(0) {
                    if next.token_type == TokenType::AttrValue {
                        let val_tok = stream.advance().unwrap();
                        value = Some(val_tok.value);
                    }
                }

                attrs.push(Attribute { name: name_tok.value, value, raw });
            }
            TokenType::BindPrefix => {
                let bind_tok = stream.advance().unwrap();
                let prop = bind_tok.value.trim_start_matches(':').to_string();
                let expr = if let Some(next) = stream.peek(0) {
                    if next.token_type == TokenType::AttrValue {
                        let val_tok = stream.advance().unwrap();
                        val_tok.value
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                };
                bindings.push(Binding { prop, expr });
            }
            TokenType::EventPrefix => {
                let evt_tok = stream.advance().unwrap();
                let event = evt_tok.value.trim_start_matches("on:").to_string();
                let handler = if let Some(next) = stream.peek(0) {
                    if next.token_type == TokenType::AttrValue {
                        let val_tok = stream.advance().unwrap();
                        val_tok.value
                    } else {
                        String::new()
                    }
                } else {
                    String::new()
                };
                events.push(EventBinding { event, handler });
            }
            TokenType::Directive => {
                let dir_tok = stream.advance().unwrap();
                let name = dir_tok.value.trim_start_matches('@').to_string();
                let value = if let Some(next) = stream.peek(0) {
                    if next.token_type == TokenType::AttrValue {
                        let val_tok = stream.advance().unwrap();
                        Some(val_tok.value)
                    } else {
                        None
                    }
                } else {
                    None
                };
                directives.push(DirectiveAttr { name, value });
            }
            _ => {
                stream.advance();
            }
        }
    }

    // Parse children if not self-closing
    let mut children = Vec::new();
    if !self_closing {
        loop {
            // Check for close tag
            if let Some(tok) = stream.peek(0) {
                if tok.token_type == TokenType::CloseTag {
                    let close_tok = stream.advance().unwrap();
                    // Verify tag name matches
                    if close_tok.value != tag {
                        errors.push(ParseError {
                            message: format!("Expected </{}> but got </{}>", tag, close_tok.value),
                            line: close_tok.pos.line,
                            col: close_tok.pos.col,
                        });
                    }
                    break;
                }
                if tok.token_type == TokenType::Eof {
                    errors.push(ParseError {
                        message: format!("Unclosed <{}> tag", tag),
                        line: tok.pos.line,
                        col: tok.pos.col,
                    });
                    break;
                }
            } else {
                break;
            }

            if let Some(child) = parse_node(stream, errors) {
                children.push(child);
            } else {
                // Skip token we can't parse
                if !stream.is_done() {
                    stream.advance();
                }
            }
        }
    }

    let end = stream.peek(0).map(|t| t.pos.clone()).unwrap_or_default();

    Some(ElementNode {
        tag,
        attrs,
        bindings,
        events,
        directives,
        children,
        self_closing,
        loc: NodeLocation { start, end },
    })
}

fn parse_component(stream: &mut TokenStream, errors: &mut Vec<ParseError>) -> Option<ComponentNode> {
    let name_tok = stream.advance()?;
    let name = name_tok.value.clone();
    let start = name_tok.pos;

    let mut props = Vec::new();
    let mut bindings = Vec::new();
    let mut events = Vec::new();
    let mut self_closing = false;

    while !stream.is_done() {
        let tok = match stream.peek(0) {
            Some(t) => t.clone(),
            None => break,
        };

        match tok.token_type {
            TokenType::SelfClose => {
                stream.advance();
                self_closing = true;
                break;
            }
            TokenType::Gt => {
                stream.advance();
                break;
            }
            TokenType::AttrName => {
                let name_tok = stream.advance().unwrap();
                let mut value = None;
                if let Some(next) = stream.peek(0) {
                    if next.token_type == TokenType::AttrValue {
                        let val_tok = stream.advance().unwrap();
                        value = Some(val_tok.value);
                    }
                }
                props.push(Attribute { name: name_tok.value, value, raw: String::new() });
            }
            TokenType::BindPrefix => {
                let bind_tok = stream.advance().unwrap();
                let prop = bind_tok.value.trim_start_matches(':').to_string();
                let expr = if let Some(next) = stream.peek(0) {
                    if next.token_type == TokenType::AttrValue {
                        stream.advance().unwrap().value
                    } else { String::new() }
                } else { String::new() };
                bindings.push(Binding { prop, expr });
            }
            _ => { stream.advance(); }
        }
    }

    let mut children = Vec::new();
    if !self_closing {
        loop {
            if let Some(tok) = stream.peek(0) {
                if tok.token_type == TokenType::CloseTag {
                    let close_tok = stream.advance().unwrap();
                    if close_tok.value != name {
                        // Mismatched — still consume
                    }
                    break;
                }
                if tok.token_type == TokenType::Eof { break; }
            } else { break; }

            if let Some(child) = parse_node(stream, errors) {
                children.push(child);
            } else {
                if !stream.is_done() { stream.advance(); }
            }
        }
    }

    let end = stream.peek(0).map(|t| t.pos.clone()).unwrap_or_default();

    Some(ComponentNode {
        name, props, bindings, events, children, self_closing,
        loc: NodeLocation { start, end },
    })
}

fn parse_interpolation(stream: &mut TokenStream, _errors: &mut Vec<ParseError>) -> Option<InterpolationNode> {
    let start_tok = stream.advance()?; // INTERP_START
    let mut expression = String::new();
    let mut depth = 1;

    while !stream.is_done() {
        let tok = match stream.peek(0) {
            Some(t) => t.clone(),
            None => break,
        };

        match tok.token_type {
            TokenType::InterpEnd => {
                depth -= 1;
                if depth == 0 {
                    let end_tok = stream.advance().unwrap();
                    return Some(InterpolationNode {
                        expression: expression.trim().to_string(),
                        loc: NodeLocation { start: start_tok.pos, end: end_tok.end },
                    });
                }
                expression.push('}');
                stream.advance();
            }
            TokenType::LBrace => {
                depth += 1;
                expression.push('{');
                stream.advance();
            }
            TokenType::RBrace => {
                depth -= 1;
                expression.push('}');
                stream.advance();
            }
            TokenType::Eof => break,
            _ => {
                expression.push_str(&tok.value);
                if tok.followed_by_whitespace {
                    expression.push(' ');
                }
                stream.advance();
            }
        }
    }

    Some(InterpolationNode {
        expression: expression.trim().to_string(),
        loc: NodeLocation { start: start_tok.pos, end: start_tok.end },
    })
}

fn parse_script_block(stream: &mut TokenStream, _errors: &mut Vec<ParseError>) -> Option<ScriptBlockNode> {
    let start_tok = stream.advance()?; // SCRIPT_OPEN
    let attrs = start_tok.value.clone();

    // Check for TEXT token (content)
    let mut content = String::new();
    if let Some(tok) = stream.peek(0) {
        if tok.token_type == TokenType::Text {
            content = stream.advance().unwrap().value;
        }
    }

    // Consume SCRIPT_CLOSE if present
    if let Some(tok) = stream.peek(0) {
        if tok.token_type == TokenType::ScriptClose {
            let close_tok = stream.advance().unwrap();
            return Some(ScriptBlockNode {
                content,
                lang: extract_lang(&attrs),
                is_module: attrs.contains("module"),
                loc: NodeLocation { start: start_tok.pos, end: close_tok.end },
            });
        }
    }

    Some(ScriptBlockNode {
        content,
        lang: extract_lang(&attrs),
        is_module: attrs.contains("module"),
        loc: NodeLocation { start: start_tok.pos.clone(), end: start_tok.end },
    })
}

fn parse_style_block(stream: &mut TokenStream, _errors: &mut Vec<ParseError>) -> Option<StyleBlockNode> {
    let start_tok = stream.advance()?; // STYLE_OPEN
    let attrs = start_tok.value.clone();

    let mut content = String::new();
    if let Some(tok) = stream.peek(0) {
        if tok.token_type == TokenType::Text {
            content = stream.advance().unwrap().value;
        }
    }

    let scoped = attrs.contains("scoped");

    if let Some(tok) = stream.peek(0) {
        if tok.token_type == TokenType::StyleClose {
            let close_tok = stream.advance().unwrap();
            return Some(StyleBlockNode {
                content,
                lang: extract_lang(&attrs),
                scoped,
                loc: NodeLocation { start: start_tok.pos, end: close_tok.end },
            });
        }
    }

    Some(StyleBlockNode {
        content,
        lang: extract_lang(&attrs),
        scoped,
        loc: NodeLocation { start: start_tok.pos.clone(), end: start_tok.end },
    })
}

fn parse_if(stream: &mut TokenStream, errors: &mut Vec<ParseError>) -> Option<IfNode> {
    parse_if_like(stream, errors, "if")
}

fn parse_if_tag(stream: &mut TokenStream, errors: &mut Vec<ParseError>) -> Option<IfNode> {
    parse_if_like(stream, errors, "if")
}

fn parse_if_like(stream: &mut TokenStream, errors: &mut Vec<ParseError>, _kw: &str) -> Option<IfNode> {
    let start_tok = stream.advance()?;
    let start = start_tok.pos;

    // Read condition: look for AttrValue or InterpStart
    let mut cond = String::new();
    if let Some(tok) = stream.peek(0) {
        if tok.token_type == TokenType::AttrValue {
            cond = stream.advance().unwrap().value;
        } else if tok.token_type == TokenType::InterpStart {
            if let Some(interp) = parse_interpolation(stream, errors) {
                cond = interp.expression;
            }
        }
    }

    // Skip to > (end of opening tag)
    while !stream.is_done() {
        if let Some(tok) = stream.peek(0) {
            if tok.token_type == TokenType::Gt || tok.token_type == TokenType::SelfClose {
                stream.advance();
                break;
            }
            stream.advance();
        } else { break; }
    }

    // Parse body until close tag
    let mut body = Vec::new();
    let mut else_body = None;
    let mut elif_branches = Vec::new();

    loop {
        if let Some(tok) = stream.peek(0) {
            if tok.token_type == TokenType::CloseTag {
                stream.advance();
                break;
            }
            if tok.token_type == TokenType::Eof { break; }

            // Check for <else> tag
            if tok.token_type == TokenType::OpenTag && tok.value == "else" {
                stream.advance();
                // Skip to >
                while !stream.is_done() {
                    if let Some(t) = stream.peek(0) {
                        if t.token_type == TokenType::Gt || t.token_type == TokenType::SelfClose {
                            stream.advance();
                            break;
                        }
                        stream.advance();
                    } else { break; }
                }
                // Parse else body
                let mut ebody = Vec::new();
                loop {
                    if let Some(t) = stream.peek(0) {
                        if t.token_type == TokenType::CloseTag {
                            stream.advance();
                            break;
                        }
                        if t.token_type == TokenType::Eof { break; }
                    } else { break; }
                    if let Some(n) = parse_node(stream, errors) {
                        ebody.push(n);
                    } else {
                        if !stream.is_done() { stream.advance(); }
                    }
                }
                else_body = Some(ebody);
                break;
            }
        } else { break; }

        if let Some(node) = parse_node(stream, errors) {
            body.push(node);
        } else {
            if !stream.is_done() { stream.advance(); }
        }
    }

    let end = stream.peek(0).map(|t| t.pos.clone()).unwrap_or_default();

    Some(IfNode {
        cond,
        body,
        else_body,
        elif_branches,
        loc: NodeLocation { start, end },
    })
}

fn parse_for(stream: &mut TokenStream, errors: &mut Vec<ParseError>) -> Option<ForNode> {
    parse_for_like(stream, errors)
}

fn parse_for_tag(stream: &mut TokenStream, errors: &mut Vec<ParseError>) -> Option<ForNode> {
    parse_for_like(stream, errors)
}

fn parse_for_like(stream: &mut TokenStream, errors: &mut Vec<ParseError>) -> Option<ForNode> {
    let start_tok = stream.advance()?;
    let start = start_tok.pos;

    // Read the for expression: "item in {items}" or "item in items"
    let mut for_expr = String::new();
    if let Some(tok) = stream.peek(0) {
        if tok.token_type == TokenType::AttrValue {
            for_expr = stream.advance().unwrap().value;
        } else if tok.token_type == TokenType::InterpStart {
            if let Some(interp) = parse_interpolation(stream, errors) {
                for_expr = interp.expression;
            }
        }
    }

    // Parse "item in iterable"
    let (item, iterable, index) = parse_for_header(&for_expr);

    // Skip to >
    while !stream.is_done() {
        if let Some(tok) = stream.peek(0) {
            if tok.token_type == TokenType::Gt || tok.token_type == TokenType::SelfClose {
                stream.advance();
                break;
            }
            stream.advance();
        } else { break; }
    }

    let mut body = Vec::new();
    loop {
        if let Some(tok) = stream.peek(0) {
            if tok.token_type == TokenType::CloseTag {
                stream.advance();
                break;
            }
            if tok.token_type == TokenType::Eof { break; }
        } else { break; }

        if let Some(node) = parse_node(stream, errors) {
            body.push(node);
        } else {
            if !stream.is_done() { stream.advance(); }
        }
    }

    let end = stream.peek(0).map(|t| t.pos.clone()).unwrap_or_default();

    Some(ForNode {
        item,
        iterable,
        index,
        body,
        loc: NodeLocation { start, end },
    })
}

fn parse_for_header(expr: &str) -> (String, String, Option<String>) {
    // Patterns: "item in items", "item, index in items", "(item, index) in items"
    let expr = expr.trim();

    // Try "X in Y"
    if let Some(in_pos) = expr.find(" in ") {
        let left = expr[..in_pos].trim();
        let right = expr[in_pos + 4..].trim();

        let right = right.trim_start_matches('{').trim_end_matches('}');

        // Check for comma in left side
        if let Some(comma_pos) = left.find(',') {
            let item = left[..comma_pos].trim()
                .trim_start_matches('(').trim().to_string();
            let index = left[comma_pos + 1..].trim()
                .trim_end_matches(')').trim().to_string();
            return (item, right.to_string(), Some(index));
        }

        return (left.to_string(), right.to_string(), None);
    }

    (expr.to_string(), String::new(), None)
}

fn parse_while(stream: &mut TokenStream, errors: &mut Vec<ParseError>) -> Option<WhileNode> {
    let start_tok = stream.advance()?;
    let start = start_tok.pos;

    let mut cond = String::new();
    if let Some(tok) = stream.peek(0) {
        if tok.token_type == TokenType::AttrValue {
            cond = stream.advance().unwrap().value;
        } else if tok.token_type == TokenType::InterpStart {
            if let Some(interp) = parse_interpolation(stream, errors) {
                cond = interp.expression;
            }
        }
    }

    while !stream.is_done() {
        if let Some(tok) = stream.peek(0) {
            if tok.token_type == TokenType::Gt || tok.token_type == TokenType::SelfClose {
                stream.advance();
                break;
            }
            stream.advance();
        } else { break; }
    }

    let mut body = Vec::new();
    loop {
        if let Some(tok) = stream.peek(0) {
            if tok.token_type == TokenType::CloseTag {
                stream.advance();
                break;
            }
            if tok.token_type == TokenType::Eof { break; }
        } else { break; }

        if let Some(node) = parse_node(stream, errors) {
            body.push(node);
        } else {
            if !stream.is_done() { stream.advance(); }
        }
    }

    let end = stream.peek(0).map(|t| t.pos.clone()).unwrap_or_default();

    Some(WhileNode {
        cond,
        body,
        loc: NodeLocation { start, end },
    })
}

fn parse_directive(stream: &mut TokenStream, errors: &mut Vec<ParseError>) -> Result<DirectiveNode, ()> {
    // At token, then ident
    let at_tok = stream.advance().ok_or(())?;

    let name_tok = match stream.peek(0) {
        Some(t) if t.token_type == TokenType::Ident || t.token_type == TokenType::Keyword => stream.advance().unwrap(),
        _ => {
            errors.push(ParseError {
                message: "Expected directive name after @".into(),
                line: at_tok.pos.line,
                col: at_tok.pos.col,
            });
            return Err(());
        }
    };

    let name = name_tok.value.clone();
    let kind = directive_kind(&name);
    let mut args = Vec::new();
    let mut body = None;

    // Check for { body }
    if let Some(tok) = stream.peek(0) {
        if tok.token_type == TokenType::LBrace {
            stream.advance();
            let mut content = String::new();
            let mut depth = 1;
            while !stream.is_done() && depth > 0 {
                if let Some(t) = stream.peek(0) {
                    match t.token_type {
                        TokenType::LBrace => { depth += 1; content.push('{'); stream.advance(); }
                        TokenType::RBrace => {
                            depth -= 1;
                            if depth > 0 { content.push('}'); }
                            stream.advance();
                        }
                        TokenType::Eof => break,
                        _ => {
                            content.push_str(&t.value);
                            stream.advance();
                        }
                    }
                } else { break; }
            }
            body = Some(content);
        }
    }

    // Check for : value
    if let Some(tok) = stream.peek(0) {
        if tok.token_type == TokenType::Colon {
            stream.advance();
            if let Some(val_tok) = stream.peek(0) {
                if val_tok.token_type == TokenType::String || val_tok.token_type == TokenType::Ident {
                    let val = stream.advance().unwrap().value;
                    args.push(DirectiveArg { key: None, value: val });
                }
            }
        }
    }

    let end = stream.peek(0).map(|t| t.pos.clone()).unwrap_or_default();

    Ok(DirectiveNode {
        kind,
        name,
        args,
        body,
        loc: NodeLocation { start: at_tok.pos, end },
    })
}

fn parse_directive_token(stream: &mut TokenStream, _errors: &mut Vec<ParseError>) -> Result<DirectiveNode, ()> {
    let dir_tok = stream.advance().ok_or(())?;
    let name = dir_tok.value.trim_start_matches('@').to_string();
    let kind = directive_kind(&name);
    let start = dir_tok.pos;

    let mut args = Vec::new();
    let mut body = None;

    if let Some(tok) = stream.peek(0) {
        if tok.token_type == TokenType::LBrace {
            stream.advance();
            let mut content = String::new();
            let mut depth = 1;
            while !stream.is_done() && depth > 0 {
                if let Some(t) = stream.peek(0) {
                    match t.token_type {
                        TokenType::LBrace => { depth += 1; content.push('{'); stream.advance(); }
                        TokenType::RBrace => {
                            depth -= 1;
                            if depth > 0 { content.push('}'); }
                            stream.advance();
                        }
                        TokenType::Eof => break,
                        _ => { content.push_str(&t.value); stream.advance(); }
                    }
                } else { break; }
            }
            body = Some(content);
        }
    }

    let end = stream.peek(0).map(|t| t.pos.clone()).unwrap_or_default();

    Ok(DirectiveNode { kind, name, args, body, loc: NodeLocation { start, end } })
}

fn directive_kind(name: &str) -> DirectiveKind {
    match name {
        "page" => DirectiveKind::Page,
        "state" => DirectiveKind::State,
        "import" => DirectiveKind::Import,
        "render" => DirectiveKind::Render,
        "layout" => DirectiveKind::Layout,
        "export" => DirectiveKind::Export,
        "head" => DirectiveKind::Head,
        "middleware" => DirectiveKind::Middleware,
        "load" => DirectiveKind::Load,
        "revalidate" => DirectiveKind::Revalidate,
        "redirect" => DirectiveKind::Redirect,
        "rewrite" => DirectiveKind::Rewrite,
        _ => DirectiveKind::Other,
    }
}

fn extract_lang(attrs: &str) -> Option<String> {
    let attrs = attrs.trim();
    for part in attrs.split_whitespace() {
        let lower = part.to_lowercase();
        if lower.starts_with("lang=") {
            let val = &part[5..];
            let val = val.trim_matches(|c| c == '"' || c == '\'');
            return Some(val.to_string());
        }
    }
    None
}
