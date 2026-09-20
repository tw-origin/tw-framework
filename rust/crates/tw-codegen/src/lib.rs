/// TW codegen — walks the AST and produces HTML, CSS, and JS output.
/// Handles elements, components, text, interpolation, control flow,
/// script/style blocks, and directives.

use tw_parser::ast::*;

/// Full compilation output.
#[derive(Debug, Clone, Default)]
pub struct CompileOutput {
    pub html: String,
    pub css: String,
    pub js: String,
    pub diagnostics: Vec<String>,
    pub metadata: CompileMetadata,
}

#[derive(Debug, Clone, Default)]
pub struct CompileMetadata {
    pub total_time_us: u64,
    pub token_count: usize,
    pub node_count: usize,
    pub directive_count: usize,
}

/// Top-level entry — compile a Program into HTML/CSS/JS.
pub fn generate(program: &Program) -> CompileOutput {
    let start = std::time::Instant::now();
    let mut html = String::new();
    let mut css = String::new();
    let mut js = String::new();
    let mut diagnostics = Vec::new();

    // Process directives
    for dir in &program.directives {
        process_directive(dir, &mut css, &mut js, &mut diagnostics);
    }

    // Generate HTML from body
    for node in &program.body {
        generate_node(node, &mut html, &mut css, &mut js);
    }

    let elapsed = start.elapsed();
    let metadata = CompileMetadata {
        total_time_us: elapsed.as_micros() as u64,
        token_count: 0,
        node_count: program.body.len(),
        directive_count: program.directives.len(),
    };

    CompileOutput { html, css, js, diagnostics, metadata }
}

/// Convenience: compile source directly to HTML.
pub fn generate_html(program: &Program) -> String {
    let mut html = String::new();
    let mut css = String::new();
    let mut js = String::new();

    for node in &program.body {
        generate_node(node, &mut html, &mut css, &mut js);
    }
    html
}

fn generate_node(node: &Node, html: &mut String, css: &mut String, js: &mut String) {
    match node {
        Node::Element(el) => generate_element(el, html, css, js),
        Node::Component(comp) => generate_component(comp, html, css, js),
        Node::Text(text) => html.push_str(&text.value),
        Node::Interpolation(interp) => {
            // For SSR, emit the expression as a placeholder
            html.push_str("<!--");
            html.push_str(&interp.expression);
            html.push_str("-->");
        }
        Node::If(if_node) => generate_if(if_node, html, css, js),
        Node::For(for_node) => generate_for(for_node, html, css, js),
        Node::While(while_node) => generate_while(while_node, html, css, js),
        Node::ScriptBlock(script) => {
            js.push_str(&script.content);
            js.push('\n');
        }
        Node::StyleBlock(style) => {
            css.push_str(&style.content);
            css.push('\n');
        }
        Node::Comment(comment) => {
            html.push_str("<!--");
            html.push_str(&comment.content);
            html.push_str("-->");
        }
        Node::Doctype(doc) => {
            html.push_str(&doc.content);
            html.push('\n');
        }
        Node::Raw(raw) => {
            html.push_str(&raw.content);
        }
    }
}

fn generate_element(el: &ElementNode, html: &mut String, css: &mut String, js: &mut String) {
    html.push('<');
    html.push_str(&el.tag);

    // Attributes
    for attr in &el.attrs {
        html.push(' ');
        html.push_str(&attr.name);
        if let Some(val) = &attr.value {
            html.push_str("=\"");
            html.push_str(&escape_attr(val));
            html.push('"');
        }
    }

    // Bindings (as data attributes)
    for bind in &el.bindings {
        html.push_str(" data-bind:");
        html.push_str(&bind.prop);
        html.push_str("=\"");
        html.push_str(&escape_attr(&bind.expr));
        html.push('"');
    }

    // Events (as data attributes)
    for evt in &el.events {
        html.push_str(" data-on:");
        html.push_str(&evt.event);
        html.push_str("=\"");
        html.push_str(&escape_attr(&evt.handler));
        html.push('"');
    }

    // Directives
    for dir in &el.directives {
        html.push_str(" data-tw-");
        html.push_str(&dir.name);
        if let Some(val) = &dir.value {
            html.push_str("=\"");
            html.push_str(&escape_attr(val));
            html.push('"');
        }
    }

    if el.self_closing {
        html.push_str(" />");
        return;
    }

    html.push('>');

    // Children
    for child in &el.children {
        generate_node(child, html, css, js);
    }

    html.push_str("</");
    html.push_str(&el.tag);
    html.push('>');
}

fn generate_component(comp: &ComponentNode, html: &mut String, css: &mut String, js: &mut String) {
    // Components render as custom elements with props as attributes
    html.push('<');
    // Convert PascalCase to kebab-case for custom element
    let kebab = to_kebab_case(&comp.name);
    html.push_str(&kebab);

    for prop in &comp.props {
        html.push(' ');
        html.push_str(&prop.name);
        if let Some(val) = &prop.value {
            html.push_str("=\"");
            html.push_str(&escape_attr(val));
            html.push('"');
        }
    }

    for bind in &comp.bindings {
        html.push_str(" :");
        html.push_str(&bind.prop);
        html.push_str("=\"");
        html.push_str(&escape_attr(&bind.expr));
        html.push('"');
    }

    if comp.self_closing {
        html.push_str(" />");
        return;
    }

    html.push('>');

    for child in &comp.children {
        generate_node(child, html, css, js);
    }

    html.push_str("</");
    html.push_str(&kebab);
    html.push('>');
}

fn generate_if(if_node: &IfNode, html: &mut String, css: &mut String, js: &mut String) {
    // SSR: render all branches with data attributes
    html.push_str("<tw-if data-cond=\"");
    html.push_str(&escape_attr(&if_node.cond));
    html.push_str("\">");
    for child in &if_node.body {
        generate_node(child, html, css, js);
    }
    html.push_str("</tw-if>");

    // Else branch
    if let Some(else_body) = &if_node.else_body {
        html.push_str("<tw-else>");
        for child in else_body {
            generate_node(child, html, css, js);
        }
        html.push_str("</tw-else>");
    }

    // Elif branches
    for branch in &if_node.elif_branches {
        html.push_str("<tw-elif data-cond=\"");
        html.push_str(&escape_attr(&branch.cond));
        html.push_str("\">");
        for child in &branch.body {
            generate_node(child, html, css, js);
        }
        html.push_str("</tw-elif>");
    }
}

fn generate_for(for_node: &ForNode, html: &mut String, css: &mut String, js: &mut String) {
    html.push_str("<tw-for data-item=\"");
    html.push_str(&escape_attr(&for_node.item));
    html.push_str("\" data-iter=\"");
    html.push_str(&escape_attr(&for_node.iterable));
    if let Some(idx) = &for_node.index {
        html.push_str("\" data-index=\"");
        html.push_str(&escape_attr(idx));
    }
    html.push_str("\">");
    for child in &for_node.body {
        generate_node(child, html, css, js);
    }
    html.push_str("</tw-for>");
}

fn generate_while(while_node: &WhileNode, html: &mut String, css: &mut String, js: &mut String) {
    html.push_str("<tw-while data-cond=\"");
    html.push_str(&escape_attr(&while_node.cond));
    html.push_str("\">");
    for child in &while_node.body {
        generate_node(child, html, css, js);
    }
    html.push_str("</tw-while>");
}

fn process_directive(dir: &DirectiveNode, css: &mut String, js: &mut String, diagnostics: &mut Vec<String>) {
    match dir.kind {
        DirectiveKind::State => {
            if let Some(body) = &dir.body {
                js.push_str("// @state\n");
                js.push_str(body);
                js.push('\n');
            }
        }
        DirectiveKind::Page => {
            // Page directives generate metadata, not visible output
            if let Some(body) = &dir.body {
                js.push_str("// @page\n");
                js.push_str(body);
                js.push('\n');
            }
        }
        DirectiveKind::Import => {
            if let Some(body) = &dir.body {
                js.push_str("// @import\n");
                js.push_str(body);
                js.push('\n');
            }
        }
        DirectiveKind::Render | DirectiveKind::Layout | DirectiveKind::Export
        | DirectiveKind::Head | DirectiveKind::Middleware | DirectiveKind::Load
        | DirectiveKind::Revalidate | DirectiveKind::Redirect | DirectiveKind::Rewrite
        | DirectiveKind::Other => {
            // Other directives — emit as comment in JS for now
            if let Some(body) = &dir.body {
                js.push_str(&format!("// @{}\n{}\n", dir.name, body));
            }
        }
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────

fn escape_attr(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '"' => result.push_str("""),
            '\'' => result.push_str("&#39;"),
            '<' => result.push_str("<"),
            '>' => result.push_str(">"),
            '&' => result.push_str("&"),
            '\n' => result.push_str("&#10;"),
            c => result.push(c),
        }
    }
    result
}

fn to_kebab_case(s: &str) -> String {
    let mut result = String::new();
    for (i, ch) in s.chars().enumerate() {
        if ch.is_ascii_uppercase() {
            if i > 0 {
                result.push('-');
            }
            result.push(ch.to_ascii_lowercase());
        } else {
            result.push(ch);
        }
    }
    result
}
