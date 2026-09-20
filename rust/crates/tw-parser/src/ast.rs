/// AST node definitions for the TW parser.
/// Mirrors the TypeScript AST node types.
/// All nodes carry source position for diagnostics.

use tw_lexer::TokenPosition;

/// Root of every .tw file — contains directives and body nodes.
#[derive(Debug, Clone)]
pub struct Program {
    pub body: Vec<Node>,
    pub directives: Vec<DirectiveNode>,
    pub source: Option<String>,
}

impl Default for Program {
    fn default() -> Self {
        Self { body: Vec::new(), directives: Vec::new(), source: None }
    }
}

/// Top-level AST node enum.
#[derive(Debug, Clone)]
pub enum Node {
    Element(ElementNode),
    Component(ComponentNode),
    Text(TextNode),
    Interpolation(InterpolationNode),
    If(IfNode),
    For(ForNode),
    While(WhileNode),
    ScriptBlock(ScriptBlockNode),
    StyleBlock(StyleBlockNode),
    Comment(CommentNode),
    Doctype(DoctypeNode),
    Raw(RawNode),
}

/// Common position info shared by all nodes.
#[derive(Debug, Clone, Default)]
pub struct NodeLocation {
    pub start: TokenPosition,
    pub end: TokenPosition,
}

// ─── Element Node ─────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ElementNode {
    pub tag: String,
    pub attrs: Vec<Attribute>,
    pub bindings: Vec<Binding>,
    pub events: Vec<EventBinding>,
    pub directives: Vec<DirectiveAttr>,
    pub children: Vec<Node>,
    pub self_closing: bool,
    pub loc: NodeLocation,
}

#[derive(Debug, Clone)]
pub struct Attribute {
    pub name: String,
    pub value: Option<String>,
    pub raw: String,
}

#[derive(Debug, Clone)]
pub struct Binding {
    pub prop: String,
    pub expr: String,
}

#[derive(Debug, Clone)]
pub struct EventBinding {
    pub event: String,
    pub handler: String,
}

#[derive(Debug, Clone)]
pub struct DirectiveAttr {
    pub name: String,
    pub value: Option<String>,
}

// ─── Component Node ───────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ComponentNode {
    pub name: String,
    pub props: Vec<Attribute>,
    pub bindings: Vec<Binding>,
    pub events: Vec<EventBinding>,
    pub children: Vec<Node>,
    pub self_closing: bool,
    pub loc: NodeLocation,
}

// ─── Text Node ────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct TextNode {
    pub value: String,
    pub loc: NodeLocation,
}

// ─── Interpolation Node ──────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct InterpolationNode {
    pub expression: String,
    pub loc: NodeLocation,
}

// ─── Control Flow Nodes ──────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct IfNode {
    pub cond: String,
    pub body: Vec<Node>,
    pub else_body: Option<Vec<Node>>,
    pub elif_branches: Vec<ElifBranch>,
    pub loc: NodeLocation,
}

#[derive(Debug, Clone)]
pub struct ElifBranch {
    pub cond: String,
    pub body: Vec<Node>,
}

#[derive(Debug, Clone)]
pub struct ForNode {
    pub item: String,
    pub iterable: String,
    pub index: Option<String>,
    pub body: Vec<Node>,
    pub loc: NodeLocation,
}

#[derive(Debug, Clone)]
pub struct WhileNode {
    pub cond: String,
    pub body: Vec<Node>,
    pub loc: NodeLocation,
}

// ─── Block Nodes ─────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ScriptBlockNode {
    pub content: String,
    pub lang: Option<String>,
    pub is_module: bool,
    pub loc: NodeLocation,
}

#[derive(Debug, Clone)]
pub struct StyleBlockNode {
    pub content: String,
    pub lang: Option<String>,
    pub scoped: bool,
    pub loc: NodeLocation,
}

#[derive(Debug, Clone)]
pub struct CommentNode {
    pub content: String,
    pub loc: NodeLocation,
}

#[derive(Debug, Clone)]
pub struct DoctypeNode {
    pub content: String,
    pub loc: NodeLocation,
}

#[derive(Debug, Clone)]
pub struct RawNode {
    pub content: String,
    pub loc: NodeLocation,
}

// ─── Directive Nodes ─────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct DirectiveNode {
    pub kind: DirectiveKind,
    pub name: String,
    pub args: Vec<DirectiveArg>,
    pub body: Option<String>,
    pub loc: NodeLocation,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DirectiveKind {
    Page,
    State,
    Import,
    Render,
    Layout,
    Export,
    Head,
    Middleware,
    Load,
    Revalidate,
    Redirect,
    Rewrite,
    Other,
}

#[derive(Debug, Clone)]
pub struct DirectiveArg {
    pub key: Option<String>,
    pub value: String,
}

// ─── Node Type Predicates ────────────────────────────────────────────

pub fn is_element(node: &Node) -> bool {
    matches!(node, Node::Element(_))
}

pub fn is_text(node: &Node) -> bool {
    matches!(node, Node::Text(_))
}

pub fn is_component(node: &Node) -> bool {
    matches!(node, Node::Component(_))
}

pub fn is_if_node(node: &Node) -> bool {
    matches!(node, Node::If(_))
}

pub fn is_for_node(node: &Node) -> bool {
    matches!(node, Node::For(_))
}

pub fn is_script_block(node: &Node) -> bool {
    matches!(node, Node::ScriptBlock(_))
}

pub fn is_style_block(node: &Node) -> bool {
    matches!(node, Node::StyleBlock(_))
}

pub fn is_interpolation(node: &Node) -> bool {
    matches!(node, Node::Interpolation(_))
}
