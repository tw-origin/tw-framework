import { describe, test, expect } from "bun:test";
import { compileSCSS } from "../packages/compiler/tw/index.ts";

describe("SCSS compiler (docs/extensions-guide.md)", () => {
  test("docs example: variables, nesting, &, mixin, lighten", () => {
    const css = compileSCSS(`
      $primary: #2563eb;
      $dark-bg: #0d1117;
      @mixin flex-center {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dashboard {
        background: $dark-bg;
        .sidebar {
          width: 240px;
          a {
            color: lighten($primary, 20%);
            padding: 8px 12px;
            &:hover { color: $primary; }
          }
        }
        .main-content {
          @include flex-center;
          flex-direction: column;
        }
      }
    `);
    expect(css).toContain(".dashboard {");
    expect(css).toContain("background: #0d1117;");
    expect(css).toContain(".dashboard .sidebar {");
    expect(css).toContain(".dashboard .sidebar a {");
    expect(css).toContain("color: #5182ef;"); // lighten(#2563eb, 20%)
    expect(css).toContain(".dashboard .sidebar a:hover {");
    expect(css).toContain("color: #2563eb;");
    expect(css).toContain("display: flex;");
    expect(css).toContain("flex-direction: column;");
  });

  test("comments are stripped", () => {
    const css = compileSCSS(`
      // line comment
      .a { color: red; /* inline */ }
      /* block
         comment */
      .b { color: blue; }
    `);
    expect(css).toContain(".a {");
    expect(css).toContain("color: red;");
    expect(css).toContain(".b {");
    expect(css).toContain("color: blue;");
    expect(css).not.toContain("comment");
    expect(css).not.toContain("/*");
  });

  test("darken() and variable scoping", () => {
    const css = compileSCSS(`
      $c: #ff8800;
      .a { color: darken($c, 50%); }
      .b { $c: #00ff00; color: $c; }
      .c { color: $c; }
    `);
    expect(css).toContain("color: #804400;"); // darken(#ff8800, 50%)
    expect(css).toContain(".b {");
    expect(css).toContain("color: #00ff00;");
    expect(css).toContain("color: #ff8800;"); // outer scope unchanged
  });

  test("mixin parameters with defaults", () => {
    const css = compileSCSS(`
      @mixin pad($t, $b: 4px) { padding: $t 0 $b; }
      .a { @include pad(8px); }
      .b { @include pad(8px, 16px); }
    `);
    expect(css).toContain("padding: 8px 0 4px;");
    expect(css).toContain("padding: 8px 0 16px;");
  });

  test("@each loops", () => {
    const css = compileSCSS(`
      @each $n in home, shop, blog {
        .#{$n}-icon { background: url("/img/#{$n}.png"); }
      }
    `);
    expect(css).toContain(".home-icon {");
    expect(css).toContain(".shop-icon {");
    expect(css).toContain(".blog-icon {");
    expect(css).toContain('url("/img/shop.png")');
  });

  test("@if / @else", () => {
    const css = compileSCSS(`
      $mode: dark;
      .x {
        @if $mode == dark { color: white; background: black; }
        @else { color: black; background: white; }
      }
      .y {
        @if 10px > 5px { z-index: 1; }
        @else { z-index: 2; }
      }
    `);
    expect(css).toContain("color: white;");
    expect(css).toContain("background: black;");
    expect(css).not.toContain("z-index: 2;");
    expect(css).toContain("z-index: 1;");
  });

  test("nested @media keeps selectors", () => {
    const css = compileSCSS(`
      .container {
        width: 1080px;
        @media (max-width: 600px) {
          width: 100%;
          .title { font-size: 1rem; }
        }
      }
    `);
    expect(css).toContain("width: 1080px;");
    expect(css).toContain("@media (max-width: 600px) {");
    expect(css).toContain("width: 100%;");
    expect(css).toContain(".container .title {");
    expect(css).toContain("font-size: 1rem;");
  });
});
